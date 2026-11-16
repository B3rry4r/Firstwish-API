import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import type { PostWishesByIdKeepBody, PostWishesByIdKeepResponse, Wish } from "../../contracts";
import { FulfilmentRegistry } from "../payments/fulfilment.registry";
import { PaymentsService } from "../payments/payments.service";
import { JobsService } from "../jobs/jobs.service";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { REASON_TEXT } from "../purchases/wish-rules";
import { NOTICE_DAYS, WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { stateOf } from "../wishes/wish-state";
import { WishesService } from "../wishes/wishes.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
export const KEEP_LENGTHS = ["month", "half", "year"] as const;
export type KeepLength = (typeof KEEP_LENGTHS)[number];

/**
 * Keeping a wish (E-228) and waking it (E-232). Keeping asks the payments start for the price book's keep line and answers its
 * payment; the keep handler of the purchases bundle moves the end when the payment settles (one way to move it). Waking is the
 * lifecycle's own move, resting to live, for a wish that already holds a keep covering now.
 */
@Injectable()
export class WishKeepsService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly payments: PaymentsService,
    private readonly registry: FulfilmentRegistry,
    private readonly entitlements: EntitlementsService,
    private readonly lifecycle: WishLifecycleService,
    private readonly wishes: WishesService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    // CB1 for a keep: one open keep payment per wish. The start holds the account lock, so two starts cannot both pass this.
    this.registry.onStart(async (accountId, request, skus, tx) => {
      if (request.purpose !== "keep" || !UUID.test(request.subjectId ?? "")) return;
      const open = await tx.payment.findFirst({
        where: { purpose: "keep", subjectId: request.subjectId, accountId, status: { in: ["pending", "started"] }, fulfilledAt: null },
        orderBy: { id: "desc" },
        select: { id: true, lines: true },
      });
      if (!open) return;
      const sku = (Array.isArray(open.lines) ? (open.lines[0] as { sku?: string } | undefined) : undefined)?.sku;
      if (sku !== skus[0]) throw AppError.conflict("keep_payment_open", "A keep for this wish is waiting to be paid. Pay it, or try again when it has lapsed.");
      return { existingPaymentId: open.id };
    });
  }

  /** Month, half or year from the body: `keepKey`, `keep` or `days` (matched against the price book's terms). Two that disagree are 422. */
  private async lengthOf(body: PostWishesByIdKeepBody): Promise<KeepLength> {
    const book = await this.entitlements.row();
    const found = new Set<KeepLength>();
    const bad: Record<string, string> = {};
    const named = (field: string, v: unknown) => {
      if (v === undefined || v === null) return;
      if (typeof v === "string" && (KEEP_LENGTHS as readonly string[]).includes(v)) found.add(v as KeepLength);
      else bad[field] = "Must be month, half or year.";
    };
    named("keepKey", body.keepKey);
    named("keep", body.keep);
    if (body.days !== undefined && body.days !== null) {
      const hit = KEEP_LENGTHS.find((l) => grantOf(book, `keep.${l}`)?.termDays === body.days);
      if (hit) found.add(hit);
      else bad.days = "Must be the length of a month, half or year keep.";
    }
    if (Object.keys(bad).length) throw AppError.validation(bad);
    if (found.size === 0) throw AppError.validation({ keepKey: "Choose month, half or year." });
    if (found.size > 1) throw AppError.validation({ keepKey: "The length named twice does not agree." });
    return [...found][0];
  }

  /** E-228. The owner only: the keep handler and the start both bind the payment to the wish's own account. */
  async keep(accountId: string, wishId: string, body: PostWishesByIdKeepBody, idempotencyKey: string | undefined): Promise<{ answer: PostWishesByIdKeepResponse; status: 200 | 201 }> {
    if (!UUID.test(wishId)) throw AppError.notFound("No such wish.");
    if (body.wishId !== undefined && body.wishId.toLowerCase() !== wishId.toLowerCase()) throw AppError.validation({ wishId: "Must be the wish in the address." });
    const length = await this.lengthOf(body);
    // the owner check is part of the query: another person's wish is not found
    const w = await this.db.wish.findFirst({ where: { id: wishId.toLowerCase(), accountId }, select: { id: true, status: true, erasedAt: true, ticket: true } });
    if (!w) throw AppError.notFound("No such wish.");
    const state = stateOf(w);
    if (state === "erased") throw AppError.conflict("wish_erased", REASON_TEXT.wish_erased);
    if (state === "taken_down") throw AppError.conflict("wish_removed", REASON_TEXT.wish_removed);
    if (state !== "live" && state !== "resting") throw AppError.conflict("wish_not_live", REASON_TEXT.wish_not_live);
    if (grantOf(await this.entitlements.row(), `ticket.${w.ticket ?? "moment"}`)?.keepable !== true) {
      throw AppError.conflict("ticket_not_keepable", "A Moment cannot be kept. Make it a Keepsake first, and it can be kept.");
    }
    // The Pass covers no keep line: neither the entitlements row nor a ruling says it does, so a keep is always paid for.
    const r = await this.payments.start(accountId, { purpose: "keep", id: length, subjectId: w.id, way: body.paymentWay }, idempotencyKey);
    let item: Wish | null = null;
    if (r.started.payment.state === "succeeded") item = (await this.wishes.get(accountId, w.id)) as unknown as Wish;
    return { answer: { payment: r.started.payment, item }, status: r.status };
  }

  /** E-232: a resting wish with a keep that covers now becomes live, in one transaction, by the lifecycle's own move. */
  async wake(accountId: string, wishId: string, bodyWishId?: string): Promise<void> {
    if (!UUID.test(wishId)) throw AppError.notFound("No such wish.");
    if (bodyWishId !== undefined && bodyWishId.toLowerCase() !== wishId.toLowerCase()) throw AppError.validation({ wishId: "Must be the wish in the address." });
    const id = wishId.toLowerCase();
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      if (!(await tx.wish.findFirst({ where: { id, accountId }, select: { id: true } }))) throw AppError.notFound("No such wish.");
      const locked = await this.lifecycle.lock(tx, id);
      if (stateOf(locked) !== "resting") throw AppError.conflict("not_allowed", "Only a resting wish can be woken.");
      const now = this.clock.now();
      const row = await tx.wish.findUniqueOrThrow({ where: { id }, select: { keptBy: true, keptUntil: true } });
      if (row.keptBy !== "keep" || !row.keptUntil || row.keptUntil.getTime() <= now.getTime()) {
        throw new AppError(402, "keep_needed", "Keep this wish for a month, six months or a year to wake it.");
      }
      const endsAt = row.keptUntil;
      await this.lifecycle.move(tx, locked, "live", { cause: "owner.wake", data: { endsAt, restingSince: null, eraseAfter: null } });
      await this.jobs.cancel("erase-wish", id, tx);
      await this.jobs.cancel("restore-window-end", id, tx);
      await this.jobs.schedule("rest-wish", endsAt, id, tx);
      const notice = new Date(endsAt.getTime() - NOTICE_DAYS * DAY_MS);
      if (notice.getTime() > now.getTime()) await this.jobs.schedule("send-notice", notice, id, tx);
      else await this.jobs.cancel("send-notice", id, tx);
    });
  }
}
