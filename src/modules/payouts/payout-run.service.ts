import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { Money } from "../../common/money/money";
import { decodeCursor, DEFAULT_LIMIT, encodeCursor } from "../../common/pagination/cursor";
import type { Payout } from "../../contracts";
import { AuditService, requireReason, type AuditActor } from "../audit/audit.service";
import { RoyaltiesService } from "../royalties/royalties.service";
import { isMonth, monthOf } from "../royalties/royalty-math";
import type { PayoutEventSink } from "./payout-event-sink";
import { PayoutProviderPort, TransferRefused, type TransferLookup } from "../../common/ports/payout-provider.port";
import { payoutWire, type PayoutFacts } from "./payout-wire";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PAYOUT_KEY = "payout.thresholdKobo";
/** How long one run holds a payout it is sending; a run that dies leaves it, and the next run sends it again (keyed by the payout id). */
export const SEND_LEASE_MS = 5 * 60_000;
/** ZZ2: a payout left sent with no news for this long is looked up at the provider. */
export const NO_NEWS_MS = 24 * 3_600_000;
export const REFERENCE_PREFIX = "fw-payout-";
const SECTION = "/admin/creators";
/** ZZ1: the staff note left on a payout whose event named a wrong amount. */
const FLAG_AMOUNT = "A provider event named a different amount: nothing was changed. Check with the provider.";
/** ZZ8: the staff note added to a payout marked paid by hand when the provider's event for it comes later. */
const FLAG_HAND = "The provider sent news for a payout marked paid by hand: nothing was changed. Check with the provider.";
const notAllowed = (message: string) => new AppError(HttpStatus.CONFLICT, "not_allowed", message);

export interface RunResult {
  month: string;
  created: number;
  sent: number;
  failed: number;
  /** ZZ2: payouts sent long ago and settled by what the provider said. */
  looked: number;
}

interface Row {
  id: string;
  creatorId: string;
  month: string;
  amountKobo: bigint;
  status: PayoutFacts["status"];
  providerReference: string | null;
  bankAccountId: string;
  createdAt: Date;
}

/**
 * The monthly payout run (R14: the 5th, for the month before; the threshold is the price-book setting payout.thresholdKobo, read
 * each time and never typed here). For a month that is over, every creator with a bank account and a balance at or over the
 * threshold gets ONE payout of the whole balance; under it, the balance carries over. Run again: nothing new. Runs at once: one set
 * (a creator's row is locked while its payout is made, and (creator, month) is unique). Making the rows and sending them are
 * separate: sending is never inside a transaction and is keyed by the payout id, so the provider acts once however often we ask.
 * A refusal marks the payout failed and the balance returns; a time-out leaves it sent, never paid; the provider's signed event
 * (applied by apply(), the PayoutEventSink) marks it paid. An erased creator is never paid.
 */
@Injectable()
export class PayoutRunService implements PayoutEventSink {
  private readonly log = new Logger("payout-run");

  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly royalties: RoyaltiesService,
    private readonly provider: PayoutProviderPort,
    private readonly audit: AuditService,
  ) {}

  /** The payout threshold in kobo, from the price-book setting. */
  async threshold(db: PrismaService | Tx = this.db): Promise<number> {
    const rows = await db.$queryRaw<{ choice: { value?: unknown } | null }[]>`
      SELECT choice FROM settings WHERE key = to_jsonb(${PAYOUT_KEY}::text) ORDER BY id LIMIT 1`;
    const v = rows[0]?.choice?.value;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) throw new AppError(503, "price_book_missing", "The payout threshold is not set up yet.");
    return v;
  }

  /** The month the 5th's job pays: the one before the clock's month. */
  lastMonth(): string {
    const now = this.clock.now();
    const m = monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    return m;
  }

  /** Makes the month's payouts and sends them. Safe to run twice and to run five times at once. */
  async run(month: string): Promise<RunResult> {
    this.assertOver(month);
    const threshold = await this.threshold();
    const candidates = await this.db.$queryRaw<{ id: string; accountId: string }[]>`
      SELECT c.id::text AS id, c."accountId"::text AS "accountId" FROM creator c JOIN account a ON a.id = c."accountId"
       WHERE a."erasedAt" IS NULL AND COALESCE(c.house, false) = false
         AND (EXISTS (SELECT 1 FROM royalty_accrual r WHERE r."creatorId" = c.id AND r.month <= ${month})
           OR EXISTS (SELECT 1 FROM royalty_reversal r WHERE r."creatorId" = c.id AND r.month <= ${month}))
       ORDER BY c.id`;
    let sent = 0;
    let failed = 0;
    const take = async (): Promise<void> => {
      // ZZ2: payouts left pending (a run that died) from any month up to this one, whatever their month.
      const pending = await this.db.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM payout WHERE month <= ${month} AND status = 'pending' ORDER BY month, id`;
      for (const p of pending) {
        const out = await this.sendOne(p.id);
        if (out === "sent") sent += 1;
        if (out === "failed") failed += 1;
      }
    };
    const looked = await this.lookUpStale();
    await take();
    let created = 0;
    for (const c of candidates) if (await this.makeFor(c.id, c.accountId, month, threshold)) created += 1;
    await take();
    return { month, created, sent, failed, looked };
  }

  private assertOver(month: string): void {
    if (!isMonth(month)) throw AppError.validation({ month: "Must be a month, YYYY-MM." });
    if (month >= monthOf(this.clock.now())) throw AppError.validation({ month: "That month is not over yet." });
  }

  /** One creator's payout for the month, in one transaction with the account and the creator row locked. True when a row was made. */
  private async makeFor(creatorId: string, accountId: string, month: string, threshold: number): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      try {
        await lockAccount(tx, accountId);
      } catch (e) {
        if (e instanceof AppError && (e.code === "account_erased" || e.code === "not_found")) return false;
        throw e;
      }
      await tx.$queryRaw`SELECT id FROM creator WHERE id = ${creatorId}::uuid FOR UPDATE`;
      if (await this.banned(tx, accountId)) return false; // ZZ3: the balance waits while the ban stands
      if (await tx.payout.findUnique({ where: { creatorId_month: { creatorId, month } }, select: { id: true } })) return false;
      const bank = await tx.bankAccount.findFirst({ where: { creatorId, accountNumber: { not: null } }, orderBy: { id: "desc" }, select: { id: true } });
      if (!bank) return false;
      const balance = await this.royalties.balance(tx, creatorId, month);
      if (balance <= 0n || balance < BigInt(threshold)) return false;
      const id = this.ids.id();
      const at = this.clock.now();
      const made = await tx.payout.createMany({
        data: [{ id, creatorId, month, amountKobo: balance, status: "pending", bankAccountId: bank.id, createdAt: at }],
        skipDuplicates: true,
      });
      if (made.count === 0) return false;
      await tx.$executeRaw`INSERT INTO payout_detail ("payoutId") VALUES (${id}::uuid)`;
      const journalId = this.ids.id();
      const memo = `Payout ${creatorId} ${month}`;
      await tx.ledgerEntry.createMany({
        data: [
          { id: this.ids.id(), journalId, account: "royalties_payable", direction: "debit", amountKobo: balance, currency: "NGN", payoutId: id, memo, createdAt: at },
          { id: this.ids.id(), journalId, account: "payouts", direction: "credit", amountKobo: balance, currency: "NGN", payoutId: id, memo, createdAt: at },
        ],
      });
      return true;
    });
  }

  /** ZZ3: an account-scope ban in force now (no end, or an end still ahead). Lifting it (removing it or ending it) lets the next run pay. */
  private async banned(db: PrismaService | Tx, accountId: string | null): Promise<boolean> {
    if (!accountId) return false;
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM ban WHERE "accountId" = ${accountId}::uuid AND scope = 'account' AND (until IS NULL OR until > ${this.clock.now()}) LIMIT 1`;
    return rows.length > 0;
  }

  /**
   * ZZ2: payouts sent and still sent after 24 hours (no event came: it may be lost) are asked about at the provider, outside any
   * transaction, and settled by the answer: success pays, failed or reversed fails (the balance returns), pending waits, and a transfer
   * the provider has never heard of, past the send lease, fails so the balance returns. An answer that cannot be had leaves it as it is.
   */
  async lookUpStale(): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - NO_NEWS_MS);
    const stale = await this.db.$queryRaw<{ id: string; sentAt: Date }[]>`
      SELECT p.id::text AS id, d."sentAt" FROM payout p JOIN payout_detail d ON d."payoutId" = p.id
       WHERE p.status = 'sent' AND d."sentAt" IS NOT NULL AND d."sentAt" <= ${cutoff} ORDER BY d."sentAt", p.id`;
    let settled = 0;
    for (const p of stale) {
      let answer: TransferLookup;
      try {
        answer = await this.provider.lookup(REFERENCE_PREFIX + p.id);
      } catch (e) {
        this.log.warn(`payout ${p.id} lookup gave no answer: ${e instanceof Error ? e.name : "unknown"}`);
        continue;
      }
      const lease = now.getTime() - p.sentAt.getTime() > SEND_LEASE_MS;
      const kind = answer.state === "success" || answer.state === "failed" || answer.state === "reversed" ? answer.state : answer.state === "unknown" && lease ? "lost" : null;
      if (!kind) continue;
      const outcome = await this.db.$transaction((tx) => this.settleIn(tx, p.id, kind, answer.amount));
      if (outcome === "paid" || outcome === "failed") settled += 1;
    }
    return settled;
  }

  /** Hands one pending payout to the provider, outside any transaction. */
  async sendOne(payoutId: string): Promise<"sent" | "failed" | "skipped"> {
    const now = this.clock.now();
    const until = new Date(now.getTime() + SEND_LEASE_MS);
    // The payout row is locked while the lease is taken, so E-114 (which locks it too) sees either the lease or the finished state.
    const claimed = await this.db.$transaction(async (tx) => {
      const own = await tx.$queryRaw<{ accountId: string | null }[]>`
        SELECT c."accountId"::text AS "accountId" FROM payout p JOIN creator c ON c.id = p."creatorId" WHERE p.id = ${payoutId}::uuid AND p.status = 'pending' FOR UPDATE OF p`;
      if (!own.length || (await this.banned(tx, own[0].accountId))) return false; // ZZ3: not sent while a ban stands; it stays pending
      const n = await tx.$executeRaw`
        UPDATE payout_detail SET "sendingUntil" = ${until} WHERE "payoutId" = ${payoutId}::uuid AND ("sendingUntil" IS NULL OR "sendingUntil" < ${now})`;
      return n === 1;
    });
    if (!claimed) return "skipped";
    const rows = await this.db.$queryRaw<{ amountKobo: bigint; accountNumber: string | null; bankCode: string | null; erasedAt: Date | null }[]>`
      SELECT p."amountKobo", b."accountNumber", b."bankCode", a."erasedAt"
        FROM payout p JOIN bank_account b ON b.id = p."bankAccountId" JOIN creator c ON c.id = p."creatorId" LEFT JOIN account a ON a.id = c."accountId"
       WHERE p.id = ${payoutId}::uuid`;
    const r = rows[0];
    if (!r || r.erasedAt || !r.accountNumber || !r.bankCode) {
      await this.fail(payoutId, "The creator's account was erased.");
      return "failed";
    }
    try {
      const ok = await this.provider.transfer({
        reference: REFERENCE_PREFIX + payoutId,
        amount: Money.kobo(r.amountKobo),
        bankCode: r.bankCode,
        accountNumber: r.accountNumber,
        narration: "Firstwish creator payout",
      });
      await this.markSent(payoutId, ok.providerReference);
      return "sent";
    } catch (e) {
      if (e instanceof TransferRefused) {
        await this.fail(payoutId, e.message.slice(0, 300));
        return "failed";
      }
      // A time-out or an answer we could not read: the transfer may have gone. Sent, never paid: only the signed event pays it.
      this.log.warn(`payout ${payoutId} left sent: ${e instanceof Error ? e.name : "unknown"}`);
      await this.markSent(payoutId, null);
      return "sent";
    }
  }

  private async markSent(payoutId: string, providerReference: string | null): Promise<void> {
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      let moved: number;
      try {
        moved = await tx.$executeRaw`
          UPDATE payout SET status = 'sent', "providerReference" = COALESCE(${providerReference}, "providerReference") WHERE id = ${payoutId}::uuid AND status = 'pending'`;
      } catch {
        // the provider's reference is already another payout's: keep ours without it
        moved = 0;
      }
      if (moved === 1) await tx.$executeRaw`UPDATE payout_detail SET "sentAt" = ${now}, "sendingUntil" = NULL WHERE "payoutId" = ${payoutId}::uuid`;
    });
  }

  /** Marks a payout failed and gives the balance back (the journal the other way round). Only from pending or sent. */
  private fail(payoutId: string, reason: string): Promise<boolean> {
    return this.db.$transaction((tx) => this.failIn(tx, payoutId, reason, ["pending", "sent"]));
  }

  /**
   * The provider's signed transfer event, stored by the webhook. success: sent becomes paid; failed or reversed: the payout fails and
   * the balance returns. The event is marked processed with its outcome in the same transaction as the change.
   */
  async apply(eventRowId: string, type: string, data: Record<string, unknown>): Promise<void> {
    const ref = typeof data.reference === "string" ? data.reference : "";
    const id = ref.startsWith(REFERENCE_PREFIX) ? ref.slice(REFERENCE_PREFIX.length) : "";
    const done = (tx: Tx | PrismaService, outcome: string) => tx.webhookEvent.update({ where: { id: eventRowId }, data: { processedAt: this.clock.now(), outcome } });
    if (!UUID.test(id)) {
      await done(this.db, "unknown_reference");
      return;
    }
    const kind = type === "transfer.success" ? "success" : type === "transfer.failed" ? "failed" : type === "transfer.reversed" ? "reversed" : null;
    await this.db.$transaction(async (tx) => {
      if (!kind) {
        const known = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM payout WHERE id = ${id}::uuid`;
        await done(tx, known.length ? "ignored" : "unknown_reference");
        return;
      }
      await done(tx, await this.settleIn(tx, id, kind, data.amount));
    });
  }

  /**
   * One outcome for one payout, in the caller's transaction (the provider's event, or the lookup of a payout with no news). The
   * payout row is locked. ZZ1: the amount must be a whole number of kobo equal to the payout's, whatever the outcome says; a float, a
   * string, null, nothing, a negative or one kobo off changes nothing and flags the payout for staff. `lost` (lookup only: the provider
   * has no such transfer) fails a sent payout without an amount to check.
   */
  private async settleIn(tx: Tx, id: string, kind: "success" | "failed" | "reversed" | "lost", amount: unknown): Promise<string> {
    const at = this.clock.now();
    const rows = await tx.$queryRaw<{ amountKobo: bigint; status: string }[]>`SELECT "amountKobo", status::text AS status FROM payout WHERE id = ${id}::uuid FOR UPDATE`;
    const p = rows[0];
    if (!p) return "unknown_reference";
    // ZZ8: a payout marked paid by hand (finance or the owner wrote one audit row, payout.mark-paid) ignores every later provider event and flags it for staff.
    if (p.status === "succeeded" && (await tx.auditEntry.count({ where: { subjectType: "Payout", subjectId: id, action: "payout.mark-paid" } })) > 0) {
      await tx.$executeRaw`UPDATE payout_detail SET note = CASE WHEN note IS NULL THEN ${FLAG_HAND} WHEN position(${FLAG_HAND} in note) > 0 THEN note ELSE note || ' ' || ${FLAG_HAND} END WHERE "payoutId" = ${id}::uuid`;
      return "paid_by_hand";
    }
    if (kind !== "lost" && !(typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 && BigInt(amount) === p.amountKobo)) {
      await tx.$executeRaw`UPDATE payout_detail SET note = COALESCE(note, ${FLAG_AMOUNT}) WHERE "payoutId" = ${id}::uuid`;
      return "amount_mismatch";
    }
    if (kind === "success") {
      const moved = await tx.$executeRaw`UPDATE payout SET status = 'succeeded' WHERE id = ${id}::uuid AND status IN ('sent', 'pending')`;
      if (moved === 1) await tx.$executeRaw`UPDATE payout_detail SET "paidAt" = ${at}, "sendingUntil" = NULL WHERE "payoutId" = ${id}::uuid`;
      return moved === 1 ? "paid" : "already";
    }
    const reason = kind === "reversed" ? "The transfer was reversed." : kind === "lost" ? "The provider has no record of this transfer." : "The transfer failed.";
    const failed = await this.failIn(tx, id, reason, kind === "reversed" ? ["pending", "sent", "succeeded"] : kind === "lost" ? ["sent"] : ["pending", "sent"]);
    return failed ? "failed" : "already";
  }

  private async failIn(tx: Tx, payoutId: string, reason: string, from: string[]): Promise<boolean> {
    const at = this.clock.now();
    const rows = await tx.$queryRaw<{ creatorId: string; month: string; amountKobo: bigint }[]>`
      UPDATE payout SET status = 'failed' WHERE id = ${payoutId}::uuid AND status::text = ANY(${from}::text[])
      RETURNING "creatorId"::text AS "creatorId", month, "amountKobo"`;
    if (!rows.length) return false;
    const p = rows[0];
    await tx.$executeRaw`UPDATE payout_detail SET "failedAt" = ${at}, "failureReason" = ${reason}, "sendingUntil" = NULL WHERE "payoutId" = ${payoutId}::uuid`;
    const journalId = this.ids.id();
    const memo = `Payout failed ${p.creatorId} ${p.month}`;
    await tx.ledgerEntry.createMany({
      data: [
        { id: this.ids.id(), journalId, account: "payouts", direction: "debit", amountKobo: p.amountKobo, currency: "NGN", payoutId, memo, createdAt: at },
        { id: this.ids.id(), journalId, account: "royalties_payable", direction: "credit", amountKobo: p.amountKobo, currency: "NGN", payoutId, memo, createdAt: at },
      ],
    });
    return true;
  }

  /** E-115 (finance, owner): the month's run, now. `id` is the run's id: the month. Same work as the job; reason and audit. */
  async approve(id: string, body: { month: string; reason: string }, actor: AuditActor): Promise<{ items: Payout[]; nextCursor: null }> {
    const reason = requireReason(body.reason);
    if (!isMonth(body.month)) throw AppError.validation({ month: "Must be a month, YYYY-MM." });
    if (id !== body.month) throw AppError.validation({ id: "The run is named by its month; it must match month." });
    this.assertOver(body.month);
    await this.db.$transaction((tx) =>
      this.audit.write(tx, { actor, section: SECTION, action: "payout-run.approve", target: { type: "PayoutRun", id: body.month }, reason, changedFields: ["payouts"] }),
    );
    await this.run(body.month);
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT id::text AS id, "creatorId"::text AS "creatorId", month, "amountKobo", status::text AS status, "providerReference", "bankAccountId"::text AS "bankAccountId", "createdAt"
        FROM payout WHERE month = ${body.month} ORDER BY "amountKobo" DESC, id`;
    return { items: await this.wire(rows), nextCursor: null };
  }

  /** E-114 (finance, owner): records that a payout still due left by hand. No money moves here. Only a payout in state due. */
  async markPaid(creatorId: string, body: { month: string; reason: string }, actor: AuditActor): Promise<Payout> {
    const reason = requireReason(body.reason);
    if (!isMonth(body.month)) throw AppError.validation({ month: "Must be a month, YYYY-MM." });
    if (!UUID.test(creatorId)) throw AppError.notFound();
    const at = this.clock.now();
    const id = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; status: string; amountKobo: bigint; creatorId: string; month: string; sendingUntil: Date | null }[]>`
        SELECT p.id::text AS id, p.status::text AS status, p."amountKobo", p."creatorId"::text AS "creatorId", p.month, d."sendingUntil"
          FROM payout p LEFT JOIN payout_detail d ON d."payoutId" = p.id WHERE p."creatorId" = ${creatorId}::uuid AND p.month = ${body.month} FOR UPDATE OF p`;
      const p = rows[0];
      if (!p) throw AppError.notFound("No payout for that creator and month.");
      // ZZ7: while a send holds its lease the transfer may be going out; marking it paid now could pay twice.
      if (p.status === "pending" && p.sendingUntil && p.sendingUntil.getTime() > at.getTime()) throw notAllowed("A send is under way for this payout. Try again when it ends.");
      if (p.status !== "pending" && p.status !== "failed") throw notAllowed("Only a payout that is due can be marked paid.");
      if (p.status === "failed") {
        // A failed payout gave its balance back; paid by hand, it takes the balance out again (the journal the first way round).
        const journalId = this.ids.id();
        const memo = `Payout ${p.creatorId} ${p.month} paid by hand`;
        await tx.ledgerEntry.createMany({
          data: [
            { id: this.ids.id(), journalId, account: "royalties_payable", direction: "debit", amountKobo: p.amountKobo, currency: "NGN", payoutId: p.id, memo, createdAt: at },
            { id: this.ids.id(), journalId, account: "payouts", direction: "credit", amountKobo: p.amountKobo, currency: "NGN", payoutId: p.id, memo, createdAt: at },
          ],
        });
      }
      await tx.$executeRaw`UPDATE payout SET status = 'succeeded' WHERE id = ${p.id}::uuid`;
      await tx.$executeRaw`UPDATE payout_detail SET "paidAt" = ${at}, note = ${reason}, "sendingUntil" = NULL WHERE "payoutId" = ${p.id}::uuid`;
      await this.audit.write(tx, { actor, section: SECTION, action: "payout.mark-paid", target: { type: "Payout", id: p.id }, reason, changedFields: ["status"] });
      return p.id;
    });
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT id::text AS id, "creatorId"::text AS "creatorId", month, "amountKobo", status::text AS status, "providerReference", "bankAccountId"::text AS "bankAccountId", "createdAt"
        FROM payout WHERE id = ${id}::uuid`;
    return (await this.wire(rows))[0];
  }

  /** E-116: the creator's own payouts, newest first. The owner is the query condition. */
  async mine(accountId: string, cursor: string | undefined, limit = DEFAULT_LIMIT): Promise<{ items: Payout[]; nextCursor: string | null }> {
    let after: string | null = null;
    if (cursor) {
      const pos = decodeCursor(cursor);
      if (!UUID.test(pos.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = pos.id;
    }
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT p.id::text AS id, p."creatorId"::text AS "creatorId", p.month, p."amountKobo", p.status::text AS status, p."providerReference",
             p."bankAccountId"::text AS "bankAccountId", p."createdAt"
        FROM payout p JOIN creator c ON c.id = p."creatorId"
       WHERE c."accountId" = ${accountId}::uuid AND (${after}::text IS NULL OR p.id::text < ${after}::text)
       ORDER BY p.id DESC LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: await this.wire(page), nextCursor: rows.length > limit && last ? encodeCursor({ key: 0, id: last.id }) : null };
  }

  private async wire(rows: Row[]): Promise<Payout[]> {
    if (!rows.length) return [];
    const threshold = await this.threshold();
    const out: Payout[] = [];
    for (const r of rows) {
      const info = await this.db.$queryRaw<{ handle: string | null; name: string | null; accountName: string | null }[]>`
        SELECT a.handle, c.name, a.name AS "accountName" FROM creator c LEFT JOIN account a ON a.id = c."accountId" WHERE c.id = ${r.creatorId}::uuid`;
      const d = await this.db.$queryRaw<{ paidAt: Date | null; note: string | null; failureReason: string | null }[]>`
        SELECT "paidAt", note, "failureReason" FROM payout_detail WHERE "payoutId" = ${r.id}::uuid`;
      const styles = await this.db.$queryRaw<{ styleSlug: string; kobo: bigint }[]>`
        SELECT s."styleSlug", sum(s.kobo)::bigint AS kobo FROM (
          SELECT "styleSlug", "amountKobo" AS kobo FROM royalty_accrual WHERE "creatorId" = ${r.creatorId}::uuid AND month = ${r.month}
          UNION ALL
          SELECT a."styleSlug", x."amountKobo" FROM royalty_reversal x JOIN royalty_accrual a ON a.id = x."accrualId" WHERE x."creatorId" = ${r.creatorId}::uuid AND x.month = ${r.month}
        ) s GROUP BY s."styleSlug" ORDER BY sum(s.kobo) DESC, s."styleSlug"`;
      const earned = styles.reduce((n, s) => n + s.kobo, 0n);
      const handle = info[0]?.handle ?? "";
      out.push(
        payoutWire(
          {
            ...r,
            handle,
            name: info[0]?.name ?? info[0]?.accountName ?? (handle ? `@${handle}` : ""),
            paidAt: d[0]?.paidAt ?? null,
            note: d[0]?.note ?? null,
            failureReason: d[0]?.failureReason ?? null,
            earnedKobo: earned,
            byStyle: styles.map((s) => ({ styleSlug: s.styleSlug, amountKobo: Number(s.kobo) })),
          },
          threshold,
        ),
      );
    }
    return out;
  }
}
