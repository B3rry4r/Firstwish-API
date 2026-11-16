import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { decodeCursor, DEFAULT_LIMIT, encodeCursor } from "../../common/pagination/cursor";
import type { Creator } from "../../contracts";
import { monthOf } from "../royalties/royalty-math";
import { maskNumber } from "./payout-wire";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The staff row of a creator: the contract's Creator, plus the bank account with its number masked. */
export type AdminCreator = Creator & { bank: { bankCode: string; accountNumber: string } | null };

interface Row {
  id: string;
  handle: string | null;
  name: string | null;
  accountName: string | null;
  person: string | null;
  line: string | null;
  img: string | null;
  house: boolean | null;
  plan: string | null;
  credits: number | null;
  signed: boolean | null;
  erased: boolean;
  earnedMonth: bigint;
  waiting: bigint;
  styles: bigint;
  premium: bigint;
  live: bigint;
  payouts: bigint;
  bankCode: string | null;
  accountNumber: string | null;
}

/** E-41: every creator for staff: plan, credits, styles, this month's earnings, what waits, payouts, and the bank (number masked). */
@Injectable()
export class AdminCreatorsService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * HP12: each creator's months with money: what was earned (accruals less reversals), the payout made for it and its state, and whether
   * it is due: a month before this one with something earned and no payout sent or paid for it (none made, or the last one failed).
   */
  private async addPayoutMonths(items: AdminCreator[], thisMonth: string): Promise<void> {
    const ids = items.map((i) => i.id);
    if (!ids.length) return;
    const [accr, rev, pay] = await Promise.all([
      this.db.royaltyAccrual.groupBy({ by: ["creatorId", "month"], where: { creatorId: { in: ids } }, _sum: { amountKobo: true } }),
      this.db.royaltyReversal.groupBy({ by: ["creatorId", "month"], where: { creatorId: { in: ids } }, _sum: { amountKobo: true } }),
      this.db.payout.findMany({ where: { creatorId: { in: ids } }, select: { creatorId: true, month: true, status: true } }),
    ]);
    for (const it of items) {
      const earned = new Map<string, bigint>();
      for (const r of [...accr, ...rev]) if (r.creatorId === it.id) earned.set(r.month, (earned.get(r.month) ?? 0n) + (r._sum.amountKobo ?? 0n));
      const paid = new Map(pay.filter((p) => p.creatorId === it.id).map((p) => [p.month, p.status]));
      const months = [...new Set([...earned.keys(), ...paid.keys()])].sort();
      it.payoutMonths = months.map((month) => {
        const e = earned.get(month) ?? 0n;
        const status = paid.get(month) ?? null;
        return { month, earnedKobo: Number(e), payoutStatus: status, due: month < thisMonth && e > 0n && (status === null || status === "failed") };
      });
    }
  }

  async list(cursor: string | undefined, limit = DEFAULT_LIMIT): Promise<{ items: AdminCreator[]; nextCursor: string | null }> {
    let after: string | null = null;
    if (cursor) {
      const pos = decodeCursor(cursor);
      if (!UUID.test(pos.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = pos.id;
    }
    const month = monthOf(this.clock.now());
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT c.id::text AS id, a.handle, c.name, a.name AS "accountName", c.person, c.line, c.img, c.house, s.plan, s.credits, s.signed, (a."erasedAt" IS NOT NULL) AS erased,
        (COALESCE((SELECT sum("amountKobo") FROM royalty_accrual x WHERE x."creatorId" = c.id AND x.month = ${month}), 0)
       + COALESCE((SELECT sum("amountKobo") FROM royalty_reversal x WHERE x."creatorId" = c.id AND x.month = ${month}), 0))::bigint AS "earnedMonth",
        (COALESCE((SELECT sum("amountKobo") FROM royalty_accrual x WHERE x."creatorId" = c.id), 0)
       + COALESCE((SELECT sum("amountKobo") FROM royalty_reversal x WHERE x."creatorId" = c.id), 0)
       - COALESCE((SELECT sum("amountKobo") FROM payout x WHERE x."creatorId" = c.id AND x.status <> 'failed'), 0))::bigint AS waiting,
        (SELECT count(*) FROM style st WHERE st.creator->>'creatorId' = c.id::text OR st.creator->>'id' = c.id::text) AS styles,
        (SELECT count(*) FROM style st WHERE (st.creator->>'creatorId' = c.id::text OR st.creator->>'id' = c.id::text) AND st.level = 'premium') AS premium,
        (SELECT count(*) FROM style st WHERE (st.creator->>'creatorId' = c.id::text OR st.creator->>'id' = c.id::text) AND st."on" = true) AS live,
        (SELECT count(*) FROM payout x WHERE x."creatorId" = c.id) AS payouts,
        b."bankCode", b."accountNumber"
      FROM creator c
      LEFT JOIN account a ON a.id = c."accountId"
      LEFT JOIN creator_state s ON s."accountId" = c."accountId"
      LEFT JOIN LATERAL (SELECT "bankCode", "accountNumber" FROM bank_account WHERE "creatorId" = c.id ORDER BY id DESC LIMIT 1) b ON true
      WHERE (${after}::text IS NULL OR c.id::text > ${after}::text)
      ORDER BY c.id LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const items = page.map(
      (r): AdminCreator => ({
        id: r.id,
        handle: r.handle ?? "",
        name: r.name ?? r.accountName ?? (r.handle ? `@${r.handle}` : ""),
        person: r.person ?? "",
        line: r.line ?? "",
        href: r.handle ? `/creators/${r.handle}` : "",
        img: r.img,
        house: r.house === true,
        own: false,
        following: false,
        plan: r.plan ?? "open",
        credits: r.credits ?? 0,
        signed: r.signed === true,
        earned: Number(r.earnedMonth),
        counts: { styles: Number(r.styles), premiumStyles: Number(r.premium), liveStyles: Number(r.live), payouts: Number(r.payouts), waitingKobo: Number(r.waiting), erased: r.erased },
        styles: { total: Number(r.styles), premium: Number(r.premium), live: Number(r.live) },
        bank: r.bankCode && r.accountNumber ? { bankCode: r.bankCode, accountNumber: maskNumber(r.accountNumber) } : null,
      }),
    );
    await this.addPayoutMonths(items, month);
    const last = page[page.length - 1];
    return { items, nextCursor: rows.length > limit && last ? encodeCursor({ key: 0, id: last.id }) : null };
  }
}
