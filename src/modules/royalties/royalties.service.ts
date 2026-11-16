import { Injectable } from "@nestjs/common";
import { Prisma, type Payment } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { decodeCursor, DEFAULT_LIMIT, encodeCursor } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { EarningsSummary, RoyaltyAccrual } from "../../contracts";
import { readOptions } from "../payments/payment-options";
import { paidLines } from "../payments/settlement.service";
import { revenueAccount } from "../payments/ledger";
import { EntitlementsService } from "../price-book/entitlements.service";
import { PriceBookService } from "../price-book/price-book.service";
import { monthOf, percentOf, splitRoyalty } from "./royalty-math";
import { monthSource, packSource, type DrawSource } from "./draw-source";
import { readStyleOwners } from "./style-owners";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PREMIUM_STYLE_SKU = "extra.premium-style";
const REVERSED_FIRST = "Royalty reversed before accrual ";

export interface AccrualMade {
  accrualId: string;
  creatorId: string;
  basis: "premium_style" | "pro_wish" | "template_share";
  amountKobo: bigint;
}

/** What the business draw tells the royalties: the business, where the draw counted the wish from, and the wish it made. */
export interface DrawAccrual {
  businessId: string;
  from: "month" | "pack";
  wishId: string;
  /** The style on the wish at the moment the caller calls (the seal: the style is final then). */
  styleSlug: string;
}

export interface Summary {
  thisMonthKobo: number;
  waitingKobo: number;
  sendingKobo: number;
  paidKobo: number;
  byStyle: { styleSlug: string; amountKobo: number }[];
}

const num = (v: bigint | number | null | undefined): number => Number(v ?? 0);

/**
 * Creators' royalties: the accrual written inside the settle transaction, its reversal on a refund, the creator's earnings list
 * and summary, and the staff earnings by line.
 *
 * THE ONE LINE the ticket and extra handlers (and nothing else) must call, inside the payment's own transaction:
 *     await this.royalties.accrue(ctx.tx, ctx.payment);
 * It is safe to call for every ticket or extra line of a payment and to replay: one accrual per payment and creator.
 * And the refund path calls `await this.royalties.reverse(tx, payment.id)` in the refund's transaction.
 *
 * THE ONE LINE the business's draw must call (ZZ5), in the draw's own transaction, once the wish's style is final:
 *     await this.royalties.accrueForDraw(tx, { businessId, from, wishId: wish.id, styleSlug: wish.styleSlug });
 * (`from` is what BusinessHandlers.draw answered.) It is safe to replay: one accrual per payment, creator and wish.
 * Chosen: accrue at the SEAL, not at the draw's first moment, because a draft can still change its style until it is sealed;
 * the maker's seal (usePlan) draws and seals in one transaction, so there the two moments are the same.
 *
 * What earns (T-65, T-66, T-67, T-77): a person's paid wish in a creator's Premium style earns the creator 20% of the premium
 * style's price in force at that payment (the payment's own price-book version and moment); a business's paid wish in a creator's
 * Premium style earns the same (ZZ4: 20% of the premium style's price in force, never of what else the payment held); a Pass wish earns nothing (it draws from the Pass, so there is no payment of
 * its own to accrue from: set nowhere); a Standard or Starter style, and a house style, earn nothing. A style made from another
 * creator's template gives a quarter of the royalty to that creator, out of it. Every share rounds down to the kobo; the rest
 * stays with Firstwish. A wish earns once: a second payment for a wish whose royalty stands changes nothing.
 */
@Injectable()
export class RoyaltiesService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly book: PriceBookService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async accrue(tx: Tx, payment: Payment): Promise<AccrualMade[]> {
    const lines = paidLines(payment);
    const wishLine = lines.find((l) => l.sku.startsWith("ticket.") || l.sku === PREMIUM_STYLE_SKU);
    if (!wishLine || payment.status !== "succeeded" || (!payment.accountId && !payment.businessId)) return [];
    // ZZ6: the payment row is locked first (a reverse takes the same lock first), so a reverse and an accrue of one payment never pass each other.
    await tx.$queryRaw`SELECT id FROM payment WHERE id = ${payment.id}::uuid FOR UPDATE`;
    if (await this.reversedFirst(tx, payment.id)) return [];

    const request = readOptions(payment.options).request;
    const named = typeof request.options?.style === "string" ? request.options.style.trim().toLowerCase() : "";
    const wishId = request.subjectId ?? payment.subjectId ?? null;
    let slug = SLUG.test(named) ? named : "";
    if (!slug && wishId && UUID.test(wishId)) {
      const w = await tx.wish.findUnique({ where: { id: wishId }, select: { styleSlug: true } });
      slug = w && SLUG.test(w.styleSlug) ? w.styleSlug : "";
    }
    if (!slug) return [];
    const style = await tx.style.findUnique({ where: { slug }, select: { level: true, creator: true, house: true } });
    if (!style || style.house || style.level !== "premium") return [];
    const owners = readStyleOwners(style.creator);
    if (!owners.creatorId) return [];

    const creator = await this.payable(tx, owners.creatorId);
    if (!creator) return [];
    const templateCreator = owners.templateCreatorId ? await this.payable(tx, owners.templateCreatorId) : null;

    const cfg = ((await this.entitlements.row(tx)).creator ?? {}) as Record<string, unknown>;
    const sharePercent = Number(cfg.sharePercent);
    const templatePercent = Number(cfg.templateRoyaltyPercent);
    if (!Number.isSafeInteger(sharePercent) || !Number.isSafeInteger(templatePercent)) throw new Error("price book: the creator share is not set");

    // ZZ4: whoever pays, and whatever else is in the payment, the base is the premium style's price in force at that payment.
    const business = payment.businessId !== null;
    const q = await this.book.quote([{ sku: PREMIUM_STYLE_SKU }], payment.createdAt, { version: payment.priceBookVersion, db: tx });
    const base = BigInt(q.lines[0].unitKobo);
    const royalty = percentOf(base, sharePercent);
    if (royalty === 0n) return [];

    // Lock the creators' rows (in id order, so two settles never wait on each other the other way round).
    const lockIds = [creator.id, ...(templateCreator ? [templateCreator.id] : [])].sort();
    await tx.$queryRaw`SELECT id FROM creator WHERE id = ANY(${lockIds}::uuid[]) ORDER BY id FOR UPDATE`;

    // A wish earns once, even when it is paid for in two payments (a ticket, then the style as an extra), unless the first was refunded.
    if (payment.subjectId) {
      const earlier = await tx.$queryRaw<{ id: string }[]>`
        SELECT a.id::text AS id FROM royalty_accrual a JOIN payment p ON p.id = a."paymentId"
         WHERE a."creatorId" = ${creator.id}::uuid AND p."subjectId" = ${payment.subjectId} AND a."paymentId" <> ${payment.id}::uuid
           AND a.basis <> 'template-share' AND NOT EXISTS (SELECT 1 FROM royalty_reversal r WHERE r."accrualId" = a.id) LIMIT 1`;
      if (earlier.length) return [];
    }

    const split = splitRoyalty(royalty, templatePercent, templateCreator !== null);
    const month = monthOf(payment.verifiedAt ?? this.clock.now());
    const made: AccrualMade[] = [];
    const rows: { creatorId: string; basis: AccrualMade["basis"]; amount: bigint }[] = [{ creatorId: creator.id, basis: business ? "pro_wish" : "premium_style", amount: split.creator }];
    if (templateCreator && split.template > 0n) rows.push({ creatorId: templateCreator.id, basis: "template_share", amount: split.template });
    const account = revenueAccount(wishLine.sku);
    const at = this.clock.now();
    for (const r of rows) {
      if (r.amount <= 0n) continue;
      const id = this.ids.id();
      const done = await tx.royaltyAccrual.createMany({
        data: [{ id, creatorId: r.creatorId, styleSlug: slug, paymentId: payment.id, basis: r.basis, amountKobo: r.amount, month, createdAt: at }],
        skipDuplicates: true,
      });
      if (done.count === 0) continue;
      const journalId = this.ids.id();
      const memo = `Royalty ${r.creatorId} ${r.basis} ${payment.providerReference}`;
      await tx.ledgerEntry.createMany({
        data: [
          { id: this.ids.id(), journalId, account, direction: "debit", amountKobo: r.amount, currency: "NGN", paymentId: payment.id, memo, createdAt: at },
          { id: this.ids.id(), journalId, account: "royalties_payable", direction: "credit", amountKobo: r.amount, currency: "NGN", paymentId: payment.id, memo, createdAt: at },
        ],
      });
      made.push({ accrualId: id, creatorId: r.creatorId, basis: r.basis, amountKobo: r.amount });
    }
    return made;
  }

  /**
   * ZZ5 (T-66): a client wish drawn from a Pro plan month or a pack earns the creator of its Premium style 20% of that wish's share
   * of what the business paid: the plan payment's line divided by the plan's wishes for the month the wish came from (a rolled-over
   * wish: the month it rolled from), or the pack line divided by the pack's size. The share rounds down, then the 20% rounds down;
   * a template style gives a quarter of it to the original creator, out of it. Standard, Starter and house styles, and a creator
   * whose account is erased, earn nothing. A creator whose account is banned still accrues; the payout waits (ZZ3).
   * The wish earns once per creator, however often this is called. Runs under the business row lock (taken here again; the draw
   * holds it already) so a refund of the plan or pack payment, which takes that lock first, and this call never pass each other.
   */
  async accrueForDraw(tx: Tx, d: DrawAccrual): Promise<AccrualMade[]> {
    if (!UUID.test(d.businessId) || !UUID.test(d.wishId) || !SLUG.test(d.styleSlug)) return [];
    await tx.$queryRaw`SELECT id FROM business WHERE id = ${d.businessId}::uuid FOR UPDATE`;
    const style = await tx.style.findUnique({ where: { slug: d.styleSlug }, select: { level: true, creator: true, house: true } });
    if (!style || style.house || style.level !== "premium") return [];
    const owners = readStyleOwners(style.creator);
    if (!owners.creatorId) return [];
    const creator = await this.payable(tx, owners.creatorId);
    if (!creator) return [];
    const templateCreator = owners.templateCreatorId ? await this.payable(tx, owners.templateCreatorId) : null;
    const now = this.clock.now();
    const source: DrawSource | null = d.from === "month" ? await monthSource(tx, d.businessId, now) : await packSource(tx, d.businessId, d.wishId);
    if (!source) return [];

    const cfg = ((await this.entitlements.row(tx)).creator ?? {}) as Record<string, unknown>;
    const sharePercent = Number(cfg.sharePercent);
    const templatePercent = Number(cfg.templateRoyaltyPercent);
    if (!Number.isSafeInteger(sharePercent) || !Number.isSafeInteger(templatePercent)) throw new Error("price book: the creator share is not set");
    const share = source.lineKobo / BigInt(source.wishes);
    const royalty = percentOf(share, sharePercent);
    if (royalty === 0n) return [];

    const lockIds = [creator.id, ...(templateCreator ? [templateCreator.id] : [])].sort();
    await tx.$queryRaw`SELECT id FROM creator WHERE id = ANY(${lockIds}::uuid[]) ORDER BY id FOR UPDATE`;
    const split = splitRoyalty(royalty, templatePercent, templateCreator !== null);
    const rows: { creatorId: string; basis: AccrualMade["basis"]; amount: bigint }[] = [{ creatorId: creator.id, basis: "pro_wish", amount: split.creator }];
    if (templateCreator && split.template > 0n) rows.push({ creatorId: templateCreator.id, basis: "template_share", amount: split.template });
    const [pay] = await tx.$queryRaw<{ ref: string }[]>`SELECT "providerReference" AS ref FROM payment WHERE id = ${source.paymentId}::uuid`;
    const account = revenueAccount(source.sku);
    const month = monthOf(now);
    const made: AccrualMade[] = [];
    for (const r of rows) {
      if (r.amount <= 0n) continue;
      const id = this.ids.id();
      const done = await tx.royaltyAccrual.createMany({
        data: [{ id, creatorId: r.creatorId, styleSlug: d.styleSlug, paymentId: source.paymentId, wishId: d.wishId, basis: r.basis, amountKobo: r.amount, month, createdAt: now }],
        skipDuplicates: true,
      });
      if (done.count === 0) continue;
      const journalId = this.ids.id();
      const memo = `Royalty ${r.creatorId} ${r.basis} ${pay?.ref ?? ""} ${d.wishId}`;
      await tx.ledgerEntry.createMany({
        data: [
          { id: this.ids.id(), journalId, account, direction: "debit", amountKobo: r.amount, currency: "NGN", paymentId: source.paymentId, memo, createdAt: now },
          { id: this.ids.id(), journalId, account: "royalties_payable", direction: "credit", amountKobo: r.amount, currency: "NGN", paymentId: source.paymentId, memo, createdAt: now },
        ],
      });
      made.push({ accrualId: id, creatorId: r.creatorId, basis: r.basis, amountKobo: r.amount });
    }
    return made;
  }

  /**
   * A refund of a payment takes its royalties back: one negative row per accrual (a reversal; the accrual itself is never touched
   * or deleted) and the journal the other way round. A second call changes nothing. When the royalty was already paid out, the
   * creator's balance goes below zero and the next run pays the difference less.
   */
  async reverse(tx: Tx, paymentId: string): Promise<{ creatorId: string; amountKobo: bigint }[]> {
    if (!UUID.test(paymentId)) throw AppError.notFound();
    await tx.$queryRaw`SELECT id FROM payment WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const accruals = await tx.$queryRaw<{ id: string; creatorId: string; amountKobo: bigint; wishId: string | null }[]>`
      SELECT id::text AS id, "creatorId"::text AS "creatorId", "amountKobo", "wishId"::text AS "wishId" FROM royalty_accrual WHERE "paymentId" = ${paymentId}::uuid ORDER BY id`;
    if (!accruals.length) {
      await this.markReversedFirst(tx, paymentId);
      return [];
    }
    const lockIds = [...new Set(accruals.map((a) => a.creatorId))].sort();
    await tx.$queryRaw`SELECT id FROM creator WHERE id = ANY(${lockIds}::uuid[]) ORDER BY id FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const line = paidLines(payment).find((l) => l.sku.startsWith("ticket.") || l.sku === PREMIUM_STYLE_SKU);
    const drawLine = paidLines(payment).find((l) => l.sku.startsWith("pro."));
    const at = this.clock.now();
    const month = monthOf(at);
    const out: { creatorId: string; amountKobo: bigint }[] = [];
    for (const a of accruals) {
      const id = this.ids.id();
      const negative = -a.amountKobo;
      const done = await tx.$executeRaw`
        INSERT INTO royalty_reversal (id, "accrualId", "creatorId", "paymentId", "amountKobo", month, "createdAt")
        VALUES (${id}::uuid, ${a.id}::uuid, ${a.creatorId}::uuid, ${paymentId}::uuid, ${negative}, ${month}, ${at})
        ON CONFLICT ("accrualId") DO NOTHING`;
      if (done === 0) continue;
      // a wish drawn from a plan or pack (ZZ5) was booked against the plan's or pack's line, any other against its ticket or extra line
      const account = revenueAccount(a.wishId && drawLine ? drawLine.sku : (line?.sku ?? PREMIUM_STYLE_SKU));
      const journalId = this.ids.id();
      const memo = `Royalty reversed ${a.creatorId} ${payment.providerReference}`;
      await tx.ledgerEntry.createMany({
        data: [
          { id: this.ids.id(), journalId, account: "royalties_payable", direction: "debit", amountKobo: a.amountKobo, currency: "NGN", paymentId, memo, createdAt: at },
          { id: this.ids.id(), journalId, account, direction: "credit", amountKobo: a.amountKobo, currency: "NGN", paymentId, memo, createdAt: at },
        ],
      });
      out.push({ creatorId: a.creatorId, amountKobo: negative });
    }
    return out;
  }

  /** ZZ6: has a reverse of this payment already come (before any accrual of it)? The mark is a pair of zero-kobo ledger lines. */
  private async reversedFirst(tx: Tx, paymentId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM ledger_entry WHERE "paymentId" = ${paymentId}::uuid AND account = 'royalties-payable' AND memo = ${REVERSED_FIRST + paymentId} LIMIT 1`;
    return rows.length > 0;
  }

  /** ZZ6: a reverse that finds no accrual leaves the mark, once, when the payment is one a royalty could come from. */
  private async markReversedFirst(tx: Tx, paymentId: string): Promise<void> {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !paidLines(payment).some((l) => l.sku.startsWith("ticket.") || l.sku === PREMIUM_STYLE_SKU)) return;
    if (await this.reversedFirst(tx, paymentId)) return;
    const journalId = this.ids.id();
    const at = this.clock.now();
    const memo = REVERSED_FIRST + paymentId;
    await tx.ledgerEntry.createMany({
      data: [
        { id: this.ids.id(), journalId, account: "royalties_payable", direction: "debit", amountKobo: 0n, currency: "NGN", paymentId, memo, createdAt: at },
        { id: this.ids.id(), journalId, account: "royalties_payable", direction: "credit", amountKobo: 0n, currency: "NGN", paymentId, memo, createdAt: at },
      ],
    });
  }

  /** A creator that can be paid: not house, its account not erased. */
  private async payable(tx: Tx, creatorId: string): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT c.id::text AS id FROM creator c JOIN account a ON a.id = c."accountId"
       WHERE c.id = ${creatorId}::uuid AND COALESCE(c.house, false) = false AND a."erasedAt" IS NULL`;
    return rows[0] ?? null;
  }

  /**
   * What the creator is owed: every accrual and reversal up to `upToMonth` (all of them when null), less every payout that has not
   * failed. It can be below zero (a refund after a payout). The ledger agrees: its royalties-payable journals say the same.
   */
  async balance(db: PrismaService | Tx, creatorId: string, upToMonth: string | null): Promise<bigint> {
    const rows = await db.$queryRaw<{ kobo: bigint }[]>`
      SELECT (
        COALESCE((SELECT sum("amountKobo") FROM royalty_accrual WHERE "creatorId" = ${creatorId}::uuid AND (${upToMonth}::text IS NULL OR month <= ${upToMonth}::text)), 0)
      + COALESCE((SELECT sum("amountKobo") FROM royalty_reversal WHERE "creatorId" = ${creatorId}::uuid AND (${upToMonth}::text IS NULL OR month <= ${upToMonth}::text)), 0)
      - COALESCE((SELECT sum("amountKobo") FROM payout WHERE "creatorId" = ${creatorId}::uuid AND status <> 'failed'), 0)
      )::bigint AS kobo`;
    return rows[0].kobo;
  }

  /** One creator's figures: this month, waiting (not yet in a payout), in a payout being sent, paid, and by style. */
  async summary(creatorId: string): Promise<Summary> {
    const month = monthOf(this.clock.now());
    const [t] = await this.db.$queryRaw<{ thisMonth: bigint; earned: bigint; paid: bigint; sending: bigint }[]>`
      SELECT
        (COALESCE((SELECT sum("amountKobo") FROM royalty_accrual WHERE "creatorId" = ${creatorId}::uuid AND month = ${month}), 0)
       + COALESCE((SELECT sum("amountKobo") FROM royalty_reversal WHERE "creatorId" = ${creatorId}::uuid AND month = ${month}), 0))::bigint AS "thisMonth",
        (COALESCE((SELECT sum("amountKobo") FROM royalty_accrual WHERE "creatorId" = ${creatorId}::uuid), 0)
       + COALESCE((SELECT sum("amountKobo") FROM royalty_reversal WHERE "creatorId" = ${creatorId}::uuid), 0))::bigint AS earned,
        COALESCE((SELECT sum("amountKobo") FROM payout WHERE "creatorId" = ${creatorId}::uuid AND status = 'succeeded'), 0)::bigint AS paid,
        COALESCE((SELECT sum("amountKobo") FROM payout WHERE "creatorId" = ${creatorId}::uuid AND status IN ('pending', 'sent')), 0)::bigint AS sending`;
    const styles = await this.db.$queryRaw<{ styleSlug: string; kobo: bigint }[]>`
      SELECT s."styleSlug", sum(s.kobo)::bigint AS kobo FROM (
        SELECT "styleSlug", "amountKobo" AS kobo FROM royalty_accrual WHERE "creatorId" = ${creatorId}::uuid
        UNION ALL
        SELECT a."styleSlug", r."amountKobo" FROM royalty_reversal r JOIN royalty_accrual a ON a.id = r."accrualId" WHERE r."creatorId" = ${creatorId}::uuid
      ) s GROUP BY s."styleSlug" ORDER BY sum(s.kobo) DESC, s."styleSlug"`;
    return {
      thisMonthKobo: num(t.thisMonth),
      waitingKobo: num(t.earned - t.paid - t.sending),
      sendingKobo: num(t.sending),
      paidKobo: num(t.paid),
      byStyle: styles.map((s) => ({ styleSlug: s.styleSlug, amountKobo: num(s.kobo) })),
    };
  }

  /** E-154: the creator's own earnings, newest first (accruals and reversals), with the summary. Owner check is the query. */
  async earnings(accountId: string, cursor: string | undefined, limit = DEFAULT_LIMIT): Promise<{ items: RoyaltyAccrual[]; nextCursor: string | null; summary: Summary }> {
    const c = await this.db.creator.findUnique({ where: { accountId }, select: { id: true } });
    if (!c) return { items: [], nextCursor: null, summary: this.empty() };
    let after: string | null = null;
    if (cursor) {
      const pos = decodeCursor(cursor);
      if (!UUID.test(pos.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = pos.id;
    }
    const rows = await this.db.$queryRaw<
      { id: string; creatorId: string; styleSlug: string; paymentId: string; basis: string; amountKobo: bigint; month: string; createdAt: Date }[]
    >`
      SELECT * FROM (
        SELECT id::text AS id, "creatorId"::text AS "creatorId", "styleSlug", "paymentId"::text AS "paymentId", basis::text AS basis, "amountKobo", month, "createdAt"
          FROM royalty_accrual WHERE "creatorId" = ${c.id}::uuid
        UNION ALL
        SELECT r.id::text, r."creatorId"::text, a."styleSlug", r."paymentId"::text, a.basis::text, r."amountKobo", r.month, r."createdAt"
          FROM royalty_reversal r JOIN royalty_accrual a ON a.id = r."accrualId" WHERE r."creatorId" = ${c.id}::uuid
      ) e WHERE (${after}::text IS NULL OR e.id < ${after}::text) ORDER BY e.id DESC LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const items = page.map(
      (r): RoyaltyAccrual => ({
        id: r.id,
        creatorId: r.creatorId,
        styleSlug: r.styleSlug,
        paymentId: r.paymentId,
        basis: r.basis as RoyaltyAccrual["basis"],
        amountKobo: num(r.amountKobo),
        month: r.month,
        createdAt: toWireInstant(r.createdAt),
      }),
    );
    const last = page[page.length - 1];
    return { items, nextCursor: rows.length > limit && last ? encodeCursor({ key: 0, id: last.id }) : null, summary: await this.summary(c.id) };
  }

  private empty(): Summary {
    return { thisMonthKobo: 0, waitingKobo: 0, sendingKobo: 0, paidKobo: 0, byStyle: [] };
  }

  /** E-50: what Firstwish took, by line of the price book, for paid payments from `from` to `to` (both days included, UTC). */
  async earningsByLine(from: string, to: string): Promise<{ items: EarningsSummary[]; nextCursor: null }> {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw AppError.validation({ from: "Must be a calendar date, YYYY-MM-DD." });
    if (end < start) throw AppError.validation({ to: "Must not be before the first day." });
    if (end.getTime() - start.getTime() > 366 * 86_400_000) throw AppError.validation({ to: "At most 366 days at a time." });
    const until = new Date(end.getTime() + 86_400_000);
    const rows = await this.db.$queryRaw<{ line: string; gross: bigint; n: bigint }[]>`
      SELECT split_part(l->>'sku', '.', 1) AS line, sum((l->>'totalKobo')::bigint)::bigint AS gross, count(DISTINCT p.id)::bigint AS n
        FROM payment p, jsonb_array_elements(p.lines) l
       WHERE p.status IN ('succeeded', 'partly-refunded', 'refunded') AND p."verifiedAt" >= ${start} AND p."verifiedAt" < ${until}
       GROUP BY 1 ORDER BY 1`;
    const NAME: Record<string, string> = { ticket: "tickets", extra: "extras", keep: "keeps", pass: "pass", pro: "pro", vault: "vault", concierge: "concierge", creator: "creator" };
    const items = rows
      .filter((r) => NAME[r.line])
      .map((r): EarningsSummary => ({
        line: NAME[r.line],
        period: `${from} to ${to}`,
        from: toWireInstant(start),
        to: toWireInstant(new Date(until.getTime() - 1)),
        grossKobo: num(r.gross),
        count: num(r.n),
      }));
    return { items, nextCursor: null };
  }
}
