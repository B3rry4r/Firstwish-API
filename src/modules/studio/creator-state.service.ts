import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { CreatorState } from "../../contracts";
import { EntitlementsService } from "../price-book/entitlements.service";
import { addMonths } from "../purchases/grants";
import { obj, type Obj } from "./studio-doc";

type Tx = Prisma.TransactionClient;

/** The creator plans the app knows. */
export type Plan = "open" | "creator";

interface Row {
  id: string;
  plan: string | null;
  credits: number | null;
  extraReviews: number | null;
  packs: number | null;
  on: boolean | null;
  signed: boolean | null;
  reviewsLeft: number | null;
  renews: Date | null;
  periodEndsAt: Date | null;
}

const n = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** What the plan and the price book allow, read from the entitlements row on every use (T-21, T-22): nothing here is a price or a limit typed in code. */
export interface Rules {
  /** Drafts at one time; null is no limit. */
  drafts: (plan: Plan) => number | null;
  reviewsPerMonth: (plan: Plan) => number;
  creditsOnce: number;
  costDraft: number;
  costChange: number;
}

export async function rulesFrom(ent: EntitlementsService, db: PrismaService | Tx): Promise<Rules> {
  const c: Obj = obj((await ent.row(db)).creator);
  const plan = (p: Plan): Obj => obj(c[p]);
  const costs = obj(c.costs);
  return {
    drafts: (p) => {
      const d = plan(p).drafts;
      if (d === "unlimited" || d === null) return null;
      if (typeof d === "number" && Number.isInteger(d) && d >= 0) return d;
      throw new AppError(503, "price_book_incomplete", "The Studio's draft limit is not set in the price book yet.");
    },
    reviewsPerMonth: (p) => n(plan(p).reviewsPerMonth),
    creditsOnce: n(plan("open").creditsOnce),
    costDraft: n(costs.draft),
    costChange: n(costs.change),
  };
}

/** The first moment of the next UTC month: where a month's reviews run out and a new month's start (rolled as a Pro plan's month is, HH1). */
export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * A creator's plan, credits and reviews (CreatorState, C-4): one row per account, counters changed only by one statement that
 * cannot be raced (UPDATE ... WHERE counter >= n RETURNING), the month rolled by the server whenever the row is read or drawn from.
 */
@Injectable()
export class CreatorStateService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly ent: EntitlementsService,
  ) {}

  rules(db: PrismaService | Tx = this.db): Promise<Rules> {
    return rulesFrom(this.ent, db);
  }

  /**
   * The account's row, made with the Open plan's start (its credits once, its first month of reviews) if it has none, locked, and
   * with the month rolled: a plan whose month has ended falls back to Open, and a new month brings the plan's reviews. Run inside a
   * transaction that already holds the account lock.
   */
  async lockRolled(tx: Tx, accountId: string): Promise<Row & { effective: Plan }> {
    const now = this.clock.now();
    const rules = await this.rules(tx);
    await tx.$executeRaw`
      INSERT INTO creator_state (id, "accountId", credits, "extraReviews", packs, plan, "reviewsLeft", "on", signed, "periodEndsAt", version)
      VALUES (${this.ids.id()}::uuid, ${accountId}::uuid, ${rules.creditsOnce}, 0, 0, 'open', ${rules.reviewsPerMonth("open")}, true, false, ${nextMonthStart(now)}, 0)
      ON CONFLICT ("accountId") DO NOTHING`;
    const rows = await tx.$queryRaw<Row[]>`
      SELECT id::text AS id, plan, credits, "extraReviews", packs, "on", signed, "reviewsLeft", renews, "periodEndsAt"
        FROM creator_state WHERE "accountId" = ${accountId}::uuid FOR UPDATE`;
    const s = rows[0];
    if (!s) throw AppError.notFound();
    const paid = s.plan === "creator" && s.renews !== null && s.renews.getTime() > now.getTime();
    const effective: Plan = paid ? "creator" : "open";
    const data: Prisma.CreatorStateUpdateInput = {};
    if (s.plan === "creator" && !paid) {
      data.plan = "open";
      s.plan = "open";
    }
    if (s.periodEndsAt === null || s.periodEndsAt.getTime() <= now.getTime()) {
      const next = effective === "creator" && s.renews ? s.renews : nextMonthStart(now);
      data.reviewsLeft = rules.reviewsPerMonth(effective);
      data.periodEndsAt = next;
      s.reviewsLeft = rules.reviewsPerMonth(effective);
      s.periodEndsAt = next;
    }
    if (Object.keys(data).length) await tx.creatorState.update({ where: { id: s.id }, data: { ...data, version: { increment: 1 } } });
    return { ...s, effective };
  }

  private toWire(accountId: string, s: Row & { effective: Plan }): CreatorState {
    return {
      accountId,
      credits: n(s.credits),
      extraReviews: n(s.extraReviews),
      on: s.on ?? true,
      packs: n(s.packs),
      periodEndsAt: s.periodEndsAt ? toWireInstant(s.periodEndsAt) : null,
      plan: s.effective,
      renews: toWireInstant(s.renews ?? s.periodEndsAt ?? addMonths(this.clock.now(), 1)),
      reviewsLeft: n(s.reviewsLeft),
      signed: s.signed ?? false,
    };
  }

  /** E-43. Reading rolls the month, so it is a write: it takes the account lock like every write on an account (AA1). */
  async read(accountId: string): Promise<CreatorState> {
    return this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      return this.toWire(accountId, await this.lockRolled(tx, accountId));
    });
  }

  /** E-44: the creator switches their Studio on or off. */
  async setOn(accountId: string, on: boolean): Promise<CreatorState> {
    return this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const s = await this.lockRolled(tx, accountId);
      await tx.creatorState.update({ where: { id: s.id }, data: { on, version: { increment: 1 } } });
      return this.toWire(accountId, { ...s, on });
    });
  }

  /**
   * Draws `credits` in ONE statement that refuses to go below zero. Answers the balance left, or null when there were not enough.
   * Rolls the month first. Run it in its own short transaction (never around a provider call).
   */
  async draw(tx: Tx, accountId: string, credits: number): Promise<number | null> {
    await this.lockRolled(tx, accountId);
    const rows = await tx.$queryRaw<{ credits: number }[]>`
      UPDATE creator_state SET credits = credits - ${credits}, version = version + 1
       WHERE "accountId" = ${accountId}::uuid AND credits >= ${credits} RETURNING credits`;
    return rows[0]?.credits ?? null;
  }

  /** Gives credits back (a provider that failed or timed out), in one statement. Answers the balance now. */
  async giveBack(tx: Tx, accountId: string, credits: number): Promise<number> {
    const rows = await tx.$queryRaw<{ credits: number }[]>`
      UPDATE creator_state SET credits = credits + ${credits}, version = version + 1 WHERE "accountId" = ${accountId}::uuid RETURNING credits`;
    return rows[0]?.credits ?? 0;
  }

  /** The balance now (a read that does not roll: the draw already did). */
  async balance(db: PrismaService | Tx, accountId: string): Promise<number> {
    const rows = await db.$queryRaw<{ credits: number }[]>`SELECT credits FROM creator_state WHERE "accountId" = ${accountId}::uuid`;
    return rows[0]?.credits ?? 0;
  }

  /**
   * Takes one review for a submission: this month's plan reviews first, then a bought extra review, else 402. Each is ONE statement
   * that cannot go below zero. Answers which was used. Run inside the transaction that holds the account lock.
   */
  async takeReview(tx: Tx, accountId: string): Promise<"plan" | "extra"> {
    await this.lockRolled(tx, accountId);
    const plan = await tx.$queryRaw<{ id: string }[]>`
      UPDATE creator_state SET "reviewsLeft" = "reviewsLeft" - 1, version = version + 1
       WHERE "accountId" = ${accountId}::uuid AND "reviewsLeft" >= 1 RETURNING id::text AS id`;
    if (plan.length) return "plan";
    const extra = await tx.$queryRaw<{ id: string }[]>`
      UPDATE creator_state SET "extraReviews" = "extraReviews" - 1, version = version + 1
       WHERE "accountId" = ${accountId}::uuid AND "extraReviews" >= 1 RETURNING id::text AS id`;
    if (extra.length) return "extra";
    throw new AppError(402, "review_needed", "You have used this month's reviews. Buy an extra review to send this style in.");
  }

  /** Gives a review back (the automatic checks sent a style back before anyone read it). */
  async giveReviewBack(tx: Tx, accountId: string, used: "plan" | "extra"): Promise<void> {
    if (used === "plan") await tx.$executeRaw`UPDATE creator_state SET "reviewsLeft" = "reviewsLeft" + 1, version = version + 1 WHERE "accountId" = ${accountId}::uuid`;
    else await tx.$executeRaw`UPDATE creator_state SET "extraReviews" = "extraReviews" + 1, version = version + 1 WHERE "accountId" = ${accountId}::uuid`;
  }

  /** The plan the account has right now (rolled, locked). */
  async planOf(tx: Tx, accountId: string): Promise<Plan> {
    return (await this.lockRolled(tx, accountId)).effective;
  }
}

