import { Injectable } from "@nestjs/common";
import type { Business, Invoice, Login, ProUsage } from "../../contracts";
import { maskEmail } from "../notices/catalog";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { clientWishWire } from "./client-wish-wire";
import { invoiceWire, InvoiceRow } from "./invoices.service";
import { PlanState, PlanView } from "./plan-view";

/** E-27 and E-128 answer the plan state with the usage fields of ProUsage first; the extra fields are the plan, logins and Vault. */
export type UsageAnswer = ProUsage & PlanState;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What staff see of one business beyond the Business shape (E-24). */
export interface AdminBusiness extends Business {
  state: PlanState;
  loginList: Login[];
  invoiceList: Invoice[];
  latestFailedPayment: { id: string; amount: number; at: string } | null;
}

/**
 * The business's own record beyond the profile: the Business shape (E-25), its usage and plan (E-128, E-27), and what staff read
 * of every business (E-23, E-24). Every number is worked out here from rows and the entitlements; nothing is typed in.
 */
@Injectable()
export class ProBusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plan: PlanView,
  ) {}

  usage(state: PlanState): UsageAnswer {
    return { ...state };
  }

  async usageOf(businessId: string): Promise<UsageAnswer> {
    return this.usage(await this.plan.stateOf(businessId));
  }

  /** A business's Login rows that stand (not removed), oldest first. */
  private async loginsOf(businessId: string, masked = false): Promise<Login[]> {
    const rows = await this.prisma.login.findMany({ where: { businessId, NOT: { status: "removed" } }, orderBy: { id: "asc" } });
    return rows.map((l) => ({ id: l.id, contact: masked ? maskEmail(l.contact ?? "") : (l.contact ?? ""), status: l.status ?? "invited" }));
  }

  /**
   * The Business shape. A login (not the owner) is shown no billing: `invoices` (the total invoiced) is 0 and the logins list is
   * left empty, because billing and the team belong to the owner.
   */
  async view(businessId: string, owner: boolean, staff = false): Promise<Business> {
    const state = await this.plan.stateOf(businessId);
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const wishes = await this.prisma.clientWish.findMany({ where: { businessId }, orderBy: { id: "desc" }, take: 50 });
    const billed = owner ? await this.invoicedTotal(businessId) : 0;
    const out: Record<string, unknown> = {
      id: b.id,
      allowance: state.allowance,
      business: b.business ?? "",
      invoices: billed,
      logins: owner ? await this.loginsOf(businessId, staff) : [],
      month: state.month ?? "",
      name: b.name ?? "",
      ownerName: b.ownerName ?? "",
      pack: state.pack,
      person: b.person ?? "",
      plan: state.plan ?? "",
      record: Array.isArray(b.record) ? b.record : [],
      rolled: state.rolled,
      since: (b.since ?? new Date(0)).toISOString(),
      used: state.used,
      vault: state.vault.billedKobo,
      vaultUsedGb: state.vault.usedGb,
      wishes: wishes.map(clientWishWire),
    };
    if (state.packEnds) out.packEnds = state.packEnds;
    if (state.renews) out.renews = state.renews;
    if (b.brand) out.brand = b.brand;
    return out as unknown as Business;
  }

  private async invoicedTotal(businessId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COALESCE(sum(i.amount), 0)::bigint AS n FROM invoice i LEFT JOIN invoice_link k ON k."invoiceId" = i.id
       WHERE i."businessId" = ${businessId}::uuid AND k."voidedAt" IS NULL`;
    return Number(rows[0]?.n ?? 0n);
  }

  /** E-23: every business, newest first. Usage is worked out for each (its month shown rolled, nothing written). */
  async adminList(cursor: string | undefined, limit: number): Promise<Page<Business>> {
    let before = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      before = c.id;
    }
    const rows = await this.prisma.business.findMany({ where: { id: { lt: before } }, orderBy: { id: "desc" }, take: limit + 1, select: { id: true } });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    const items: Business[] = [];
    for (const r of page.items) items.push(await this.view(r.id, true, true));
    return { items, nextCursor: page.nextCursor };
  }

  /** E-24: one business with its plan state, logins, invoices and the latest failed payment. */
  async adminOne(id: string): Promise<AdminBusiness> {
    if (!UUID.test(id)) throw AppError.notFound();
    const exists = await this.prisma.business.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw AppError.notFound();
    const base = await this.view(id, true, true);
    const state = await this.plan.stateOf(id);
    const invoices = await this.prisma.$queryRaw<InvoiceRow[]>`
      SELECT i.id::text AS id, i.amount, i.date, i.key, i.lines, i.no, i.vat, i.what, k."voidedAt" AS "voidedAt"
        FROM invoice i LEFT JOIN invoice_link k ON k."invoiceId" = i.id WHERE i."businessId" = ${id}::uuid ORDER BY i.id DESC LIMIT 100`;
    const failed = await this.prisma.payment.findFirst({ where: { businessId: id, status: "failed" }, orderBy: { id: "desc" }, select: { id: true, amountKobo: true, updatedAt: true } });
    return {
      ...base,
      state,
      loginList: await this.loginsOf(id, true),
      invoiceList: invoices.map(invoiceWire),
      latestFailedPayment: failed ? { id: failed.id, amount: Number(failed.amountKobo), at: failed.updatedAt.toISOString() } : null,
    };
  }
}
