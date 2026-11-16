import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma, Reconciliation } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { dateOnlyOf, toWireInstant } from "../../common/time/time";
import type { LedgerDay, Reconciliation as ReconciliationWire } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { RefundProviderPort } from "../../common/ports/refund-provider.port";

const DAY_MS = 86_400_000;

export type DiffKind = "provider_only" | "ours_only" | "amount_differs";
export interface Diff {
  kind: DiffKind;
  reference: string;
  /** What our ledger moved through the provider's clearing account for this payment that day (kobo, integer). */
  oursKobo: number;
  /** What the provider reports for it. */
  theirsKobo: number;
}

const startOf = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/**
 * The settlement check (A11): for one finished UTC day, what our ledger moved through provider-clearing, payment by payment,
 * against what the provider says it settled. The answer is a row (a total on each side, the difference, each difference listed).
 * It is written once per day and never changes, and nothing in the ledger or the payments is ever corrected from it.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly provider: RefundProviderPort,
  ) {}

  /** The day before today (UTC): what the daily job checks. */
  yesterday(): string {
    return dateOnlyOf(new Date(this.clock.now().getTime() - DAY_MS));
  }

  /** E-144: a staff request to check a day. Answers the stored row (a day already checked is not checked again). */
  async runByStaff(day: string, reason: string, actor: AuditActor): Promise<ReconciliationWire> {
    const r = requireReason(reason);
    const out = await this.reconcile(day, async (tx, row) => {
      await this.audit.write(tx, { actor, section: "/admin/payments", action: "reconciliation.run", target: { type: "reconciliation", id: row.id }, reason: r, changedFields: ["status"] });
    });
    return wire(out.row);
  }

  /** Checks one finished day, once. Answers the row and whether this call wrote it. */
  async reconcile(day: string, inTx?: (tx: Prisma.TransactionClient, row: Reconciliation) => Promise<void>): Promise<{ row: Reconciliation; created: boolean }> {
    if (day >= dateOnlyOf(this.clock.now())) throw AppError.validation({ day: "That day is not over yet." });
    const have = await this.db.reconciliation.findUnique({ where: { day: startOf(day) } });
    if (have) return { row: have, created: false };

    const ours = await this.oursFor(day);
    // Outside any transaction. A time-out is 504 (the port); any other provider error is 502 in the envelope and writes no row (TT6).
    const theirs = await this.provider.settlement(day).catch((e: unknown) => {
      if (e instanceof AppError) throw e;
      throw new AppError(HttpStatus.BAD_GATEWAY, "provider_unavailable", "The payment service did not answer the settlement check. Nothing was stored; try again in a moment.");
    });
    const diffs = compare(ours, new Map(theirs.lines.map((l) => [l.reference, l.netKobo])));
    const oursTotal = [...ours.values()].reduce((a, b) => a + b, 0n);
    const difference = oursTotal - theirs.totalKobo;
    const id = this.ids.id();
    return this.db.$transaction(async (tx) => {
      const made = await tx.reconciliation.createMany({
        data: [{ id, day: startOf(day), providerTotalKobo: theirs.totalKobo, ledgerTotalKobo: oursTotal, differenceKobo: difference, status: diffs.length || difference !== 0n ? "mismatch" : "matched", mismatches: diffs as unknown as Prisma.InputJsonArray, createdAt: this.clock.now() }],
        skipDuplicates: true,
      });
      const row = await tx.reconciliation.findUniqueOrThrow({ where: { day: startOf(day) } });
      if (made.count === 1 && inTx) await inTx(tx, row);
      return { row, created: made.count === 1 };
    });
  }

  /** E-63: the stored check of a day (the latest one when none is named), with how many payments each side counted. */
  async ledgerDay(day?: string): Promise<LedgerDay> {
    const row = day
      ? await this.db.reconciliation.findUnique({ where: { day: startOf(day) } })
      : await this.db.reconciliation.findFirst({ orderBy: { day: "desc" } });
    if (!row) throw AppError.notFound(day ? "That day has not been checked yet." : "No day has been checked yet.");
    const dayText = dateOnlyOf(row.day);
    const diffs = readDiffs(row.mismatches);
    const oursCount = (await this.oursFor(dayText)).size;
    const theirsCount = oursCount - diffs.filter((d) => d.kind === "ours_only").length + diffs.filter((d) => d.kind === "provider_only").length;
    return { day: toWireInstant(row.day), diffs, ours: Number(row.ledgerTotalKobo), oursCount, theirs: Number(row.providerTotalKobo), theirsCount };
  }

  /** Net kobo through provider-clearing per payment reference on a UTC day: debits in, credits out (fees and refunds). */
  private async oursFor(day: string): Promise<Map<string, bigint>> {
    const from = startOf(day);
    const to = new Date(from.getTime() + DAY_MS);
    const rows = await this.db.$queryRaw<{ reference: string; net: bigint }[]>`
      SELECT p."providerReference" AS reference,
             SUM(CASE WHEN l.direction = 'debit' THEN l."amountKobo" ELSE -l."amountKobo" END)::bigint AS net
        FROM ledger_entry l JOIN payment p ON p.id = l."paymentId"
       WHERE l.account = 'provider-clearing' AND l."createdAt" >= ${from} AND l."createdAt" < ${to}
       GROUP BY p."providerReference"`;
    return new Map(rows.map((r) => [r.reference, BigInt(r.net)]));
  }
}

function compare(ours: Map<string, bigint>, theirs: Map<string, bigint>): Diff[] {
  const out: Diff[] = [];
  for (const [reference, o] of ours) {
    const t = theirs.get(reference);
    if (t === undefined) out.push({ kind: "ours_only", reference, oursKobo: Number(o), theirsKobo: 0 });
    else if (t !== o) out.push({ kind: "amount_differs", reference, oursKobo: Number(o), theirsKobo: Number(t) });
  }
  for (const [reference, t] of theirs) if (!ours.has(reference)) out.push({ kind: "provider_only", reference, oursKobo: 0, theirsKobo: Number(t) });
  return out.sort((a, b) => a.reference.localeCompare(b.reference));
}

const readDiffs = (json: Prisma.JsonValue): Diff[] => (Array.isArray(json) ? (json as unknown as Diff[]) : []);

function wire(r: Reconciliation): ReconciliationWire {
  return {
    id: r.id,
    day: toWireInstant(r.day),
    providerTotalKobo: Number(r.providerTotalKobo),
    ledgerTotalKobo: Number(r.ledgerTotalKobo),
    differenceKobo: Number(r.differenceKobo),
    status: r.status,
    mismatches: readDiffs(r.mismatches),
    createdAt: toWireInstant(r.createdAt),
  };
}
