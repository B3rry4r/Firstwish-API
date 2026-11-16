import { Injectable } from "@nestjs/common";
import type { Payment } from "@prisma/client";
import type { Invoice, InvoiceFile } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { EntitlementsService } from "../price-book/entitlements.service";
import { vatBasisPoints, vatInside } from "../payments/ledger";
import type { Tx } from "../purchases/grants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InvoiceRow {
  id: string;
  amount: bigint | null;
  date: Date | null;
  key: string | null;
  lines: unknown;
  no: string | null;
  vat: bigint | null;
  what: string | null;
  voidedAt: Date | null;
}

/** An invoice as the wire has it. A voided invoice says so inside `lines` (voidedAt) and stays in the list. */
export function invoiceWire(r: InvoiceRow): Invoice {
  const lines = r.lines && typeof r.lines === "object" && !Array.isArray(r.lines) ? { ...(r.lines as Record<string, unknown>) } : {};
  if (r.voidedAt) lines.voidedAt = r.voidedAt.toISOString();
  return {
    id: r.id,
    no: r.no ?? "",
    key: r.key ?? "",
    what: r.what ?? "",
    amount: Number(r.amount ?? 0n),
    vat: Number(r.vat ?? 0n),
    date: (r.date ?? new Date(0)).toISOString(),
    lines,
  };
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
const naira = (kobo: number): string => `NGN ${(kobo / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

/**
 * Invoices (E-59, E-60). Every plan and pack payment leaves one invoice, written in the settle transaction by issue(tx, payment):
 * the number comes from one counter row taken under a row lock in that same transaction, so numbers run in order with no gap (a
 * rolled-back payment gives its number back). The VAT part is the price book's rate inside the total, to the kobo. A refund voids
 * the invoice (voidFor) and never deletes it.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Called by the plan, pack and Vault-space handlers (BusinessHandlers) at the end of their work, with the settle transaction and
   * the payment: `await this.invoices.issue(ctx.tx, ctx.payment)`. A second call for the same payment keeps its one invoice (its
   * period is worked out again from the payment's grants). Answers the invoice id, or null when the payment names no business.
   */
  async issue(tx: Tx, payment: Pick<Payment, "id" | "businessId" | "amountKobo" | "lines">): Promise<string | null> {
    if (!payment.businessId) return null;
    const now = this.clock.now();
    const span = await tx.$queryRaw<{ s: Date | null; e: Date | null }[]>`
      SELECT min("startsAt") AS s, max("endsAt") AS e FROM purchase_grant WHERE "paymentId" = ${payment.id}::uuid AND "refusedReason" IS NULL AND "revokedAt" IS NULL`;
    const items = (Array.isArray(payment.lines) ? (payment.lines as { sku?: string; name?: string; qty?: number; totalKobo?: number }[]) : []).map((l) => ({
      what: l.name ?? l.sku ?? "",
      sku: l.sku ?? "",
      qty: l.qty ?? 1,
      amount: l.totalKobo ?? 0,
    }));
    const lines = { items, period: { from: (span[0]?.s ?? now).toISOString(), to: span[0]?.e ? span[0].e.toISOString() : null } };
    const found = await tx.$queryRaw<{ id: string }[]>`SELECT "invoiceId"::text AS id FROM invoice_link WHERE "paymentId" = ${payment.id}::uuid FOR UPDATE`;
    if (found[0]) {
      await tx.$executeRaw`UPDATE invoice SET lines = ${JSON.stringify(lines)}::jsonb WHERE id = ${found[0].id}::uuid`;
      await tx.$executeRaw`UPDATE invoice_link SET "periodStart" = ${span[0]?.s ?? now}::timestamptz, "periodEnd" = ${span[0]?.e ?? null}::timestamptz WHERE "invoiceId" = ${found[0].id}::uuid`;
      return found[0].id;
    }
    const counter = await tx.$queryRaw<{ last: number }[]>`UPDATE invoice_counter SET last = last + 1 WHERE id = 1 RETURNING last`;
    const n = counter[0]?.last;
    if (!n) throw new Error("invoice counter is missing");
    const no = `FW-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(n).padStart(4, "0")}`;
    const total = payment.amountKobo;
    const vat = vatInside(total, vatBasisPoints((await this.entitlements.row(tx)).vatRate));
    const what = items.map((i) => i.what).filter(Boolean).join(" and ") || "Firstwish";
    const key = items[0]?.sku.split(".")[0] ?? "pro";
    const id = this.ids.id();
    await tx.invoice.create({ data: { id, businessId: payment.businessId, amount: total, vat, date: now, key, lines, no, what } });
    await tx.$executeRaw`
      INSERT INTO invoice_link ("invoiceId", "paymentId", "periodStart", "periodEnd")
      VALUES (${id}::uuid, ${payment.id}::uuid, ${span[0]?.s ?? now}::timestamptz, ${span[0]?.e ?? null}::timestamptz)`;
    return id;
  }

  /** A refund marks the payment's invoice void. It never deletes it; voiding twice changes nothing. Answers whether an invoice was found. */
  async voidFor(tx: Tx, paymentId: string): Promise<boolean> {
    const now = this.clock.now();
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE invoice_link SET "voidedAt" = COALESCE("voidedAt", ${now}::timestamptz) WHERE "paymentId" = ${paymentId}::uuid RETURNING "invoiceId"::text AS id`;
    return rows.length > 0;
  }

  /** E-59: the business's own invoices, newest first. The owner check is in the query. */
  async list(businessId: string, cursor: string | undefined, limit: number): Promise<Page<Invoice>> {
    let before = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      before = c.id;
    }
    const rows = await this.prisma.$queryRaw<InvoiceRow[]>`
      SELECT i.id::text AS id, i.amount, i.date, i.key, i.lines, i.no, i.vat, i.what, k."voidedAt" AS "voidedAt"
        FROM invoice i LEFT JOIN invoice_link k ON k."invoiceId" = i.id
       WHERE i."businessId" = ${businessId}::uuid AND i.id < ${before}::uuid ORDER BY i.id DESC LIMIT ${limit + 1}`;
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map(invoiceWire), nextCursor: page.nextCursor };
  }

  /** E-60: one invoice as a page the browser saves, built here from the invoice, the business and the account's contact. */
  async file(businessId: string, id: string): Promise<InvoiceFile> {
    if (!UUID.test(id)) throw AppError.notFound();
    const rows = await this.prisma.$queryRaw<InvoiceRow[]>`
      SELECT i.id::text AS id, i.amount, i.date, i.key, i.lines, i.no, i.vat, i.what, k."voidedAt" AS "voidedAt"
        FROM invoice i LEFT JOIN invoice_link k ON k."invoiceId" = i.id WHERE i.id = ${id}::uuid AND i."businessId" = ${businessId}::uuid`;
    const r = rows[0];
    if (!r) throw AppError.notFound();
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { business: true, name: true, account: { select: { contact: true } } } });
    const inv = invoiceWire(r);
    const lines = (inv.lines ?? {}) as { items?: { what: string; amount: number }[]; period?: { from?: string; to?: string | null } };
    const rowsHtml = (lines.items ?? []).map((l) => `<tr><td>${esc(l.what)}</td><td class="n">${esc(naira(l.amount))}</td></tr>`).join("");
    const period = lines.period?.from ? `${day(lines.period.from)}${lines.period.to ? ` to ${day(lines.period.to)}` : ""}` : "";
    const stamp = r.voidedAt ? `<p class="stamp void">Void</p>` : `<p class="stamp">Paid</p>`;
    const text = [
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(inv.no ?? "")}</title>`,
      `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:32px auto;padding:0 16px}td{padding:6px 0}.n{text-align:right}.stamp{display:inline-block;border:2px solid #c8693a;color:#c8693a;padding:2px 12px;border-radius:6px}.void{color:#777;border-color:#777}</style></head><body>`,
      `<h1>Invoice ${esc(inv.no ?? "")}</h1>${stamp}`,
      `<p>Date: ${esc(day(inv.date))}${period ? `<br>Period: ${esc(period)}` : ""}</p>`,
      `<p>To: ${esc(b.business ?? b.name ?? "")}${b.account?.contact ? `<br>${esc(b.account.contact)}` : ""}</p>`,
      `<table>${rowsHtml}<tr><td>VAT included in the total</td><td class="n">${esc(naira(inv.vat))}</td></tr><tr><td><b>Total</b></td><td class="n"><b>${esc(naira(inv.amount))}</b></td></tr></table>`,
      `<p>Firstwish</p></body></html>`,
    ].join("");
    return { name: `firstwish-invoice-${inv.no}.html`, type: "text/html", text };
  }
}
