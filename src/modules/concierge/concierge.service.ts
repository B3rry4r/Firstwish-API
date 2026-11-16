import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma, type ConciergeOrder as OrderRow } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { ConciergeOrder, Maker } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { FulfilmentRegistry, type FulfilmentContext } from "../payments/fulfilment.registry";
import { flagRefundDue } from "../refunds/refund-due";
import { EntitlementsService } from "../price-book/entitlements.service";
import { NoticesService } from "../notices/notices.service";
import { InvoicesService } from "../pro-business/invoices.service";
import { PriceBookService } from "../price-book/price-book.service";
import { discounted } from "../price-book/price-math";
import { BusinessOf } from "../people/business-of";
import { ReceiverActivityService } from "../public-wishes/receiver-activity.service";
import { canMove, dueAtFor, OPEN, stateOf, UUID } from "./order-state";

const SECTION = "/admin/concierge";
const SKU = "concierge.single";
type Tx = Prisma.TransactionClient;

/** The staff caller: who they are and what they may see (A9: a maker sees only the orders given to them). */
export interface StaffCaller {
  staffId: string;
  roles: string[];
}
const seesAll = (c: StaffCaller): boolean => c.roles.includes("owner") || c.roles.includes("ops");

interface Ext {
  orderId: string;
  amountKobo: bigint;
  listKobo: bigint;
  paymentId: string | null;
  paidAt: Date | null;
  dueAt: Date | null;
  givenAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
}

/**
 * Concierge orders (B19). One order is priced from the price book when it is placed and keeps that price (its own row), is paid
 * through the payments start, and is made by one maker. Every change runs in one transaction under the order's row lock.
 */
@Injectable()
export class ConciergeService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly book: PriceBookService,
    private readonly entitlements: EntitlementsService,
    private readonly businesses: BusinessOf,
    private readonly activity: ReceiverActivityService,
    private readonly registry: FulfilmentRegistry,
    private readonly notices: NoticesService,
    private readonly invoices: InvoicesService,
  ) {}

  onModuleInit(): void {
    // the payments start asks first (GG3): only the buyer's own open order, at the price the payment would charge
    this.registry.onStart(async (accountId, request, _skus, tx, quote) => {
      if (request.purpose !== "concierge") return;
      const orderId = request.subjectId ?? "";
      // CB1: the order's row is locked, so two starts for it cannot both go past the check below
      const rows = UUID.test(orderId)
        ? await tx.$queryRaw<{ status: string; count: number; amountKobo: bigint; listKobo: bigint }[]>`
            SELECT o.status::text AS status, o.count, e."amountKobo", e."listKobo" FROM concierge_order o JOIN concierge_order_ext e ON e."orderId" = o.id
             WHERE o.id = ${orderId}::uuid AND o."accountId" = ${accountId}::uuid FOR UPDATE OF o`
        : [];
      const o = rows[0];
      if (!o) throw AppError.validation({ subjectId: "Name one of your own Concierge orders." });
      if (o.status !== "brief" && o.status !== "quoted") throw AppError.conflict("order_not_payable", "This order is paid for or finished.");
      const pending = await tx.payment.findFirst({ where: { purpose: "concierge", subjectId: orderId, accountId, status: "pending" }, orderBy: { id: "desc" }, select: { id: true } });
      if (pending) return { existingPaymentId: pending.id };
      // CA1: the charge is the order's own stored price (count x unit, the Pass holder's discount, or the staff quote), never a unit price
      if (o.amountKobo <= 0n || o.amountKobo > BigInt(Number.MAX_SAFE_INTEGER)) throw AppError.validation({ subjectId: "This order's price cannot be paid yet." });
      const total = Number(o.amountKobo);
      const list = Number(o.listKobo);
      quote.lines = [{ sku: SKU, name: quote.lines[0]?.name ?? "Concierge", qty: o.count, listKobo: Math.floor(list / o.count), unitKobo: Math.floor(total / o.count), totalKobo: total, discounted: total !== list }];
      quote.totalKobo = total;
      quote.listTotalKobo = list;
    });
    // after the purchases line records the grant, the order becomes paid in the same payment transaction
    const prior = this.registry.get(SKU);
    this.registry.replace(SKU, async (ctx) => {
      await prior?.(ctx);
      await this.settle(ctx);
    });
  }

  // ---------------------------------------------------------------- the customer

  /** E-40: places an order. The price comes from the price book, never from the request. */
  async place(accountId: string, body: { brief: string; count: number; kind: string; rush?: boolean }): Promise<ConciergeOrder> {
    if (body.rush === true) throw AppError.validation({ rush: "Rush is not sold." });
    const kind = body.kind === "list" ? "list" : "single";
    if (kind === "single" && body.count !== 1) throw AppError.validation({ count: "One wish is one. Choose a list for more." });
    if (kind === "list" && body.count < 2) throw AppError.validation({ count: "A list is two wishes or more." });
    const now = this.clock.now();
    const id = this.ids.id();
    const orderId = await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const quote = await this.book.quote([{ sku: SKU, qty: body.count }], now, { db: tx });
      const pass = await this.hasPass(tx, accountId, now);
      const percent = pass ? (await this.entitlements.row(tx)).conciergePassDiscountPercent : 0;
      const amount = discounted(BigInt(quote.totalKobo), percent);
      const businessId = await this.businesses.find(accountId);
      await tx.conciergeOrder.create({
        data: { id, accountId, businessId, kind, count: body.count, rush: false, brief: body.brief.trim(), status: "brief", createdAt: now },
      });
      await tx.$executeRaw`INSERT INTO concierge_order_ext ("orderId", "amountKobo", "listKobo", "createdAt")
                           VALUES (${id}::uuid, ${amount}, ${BigInt(quote.listTotalKobo)}, ${now})`;
      return id;
    });
    return this.one({ accountId }, orderId);
  }

  async readOwn(accountId: string, id: string): Promise<ConciergeOrder> {
    return this.one({ accountId }, id);
  }

  async listOwn(accountId: string, q: { cursor?: string; limit?: number }): Promise<Page<ConciergeOrder>> {
    return this.page({ accountId }, q);
  }

  /** The customer cancels an order that has not been given to a maker yet. After payment the payment is marked refund_due. */
  async cancelOwn(accountId: string, id: string): Promise<ConciergeOrder> {
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const o = await this.lock(tx, id, { accountId });
      if (o.status === "making" || o.status === "given") throw AppError.conflict("order_with_maker", "This order is already with a maker. Ask Firstwish to cancel it.");
      await this.cancelLocked(tx, o, null, null);
    });
    return this.one({ accountId }, id);
  }

  // ---------------------------------------------------------------- staff

  async staffRead(c: StaffCaller, id: string): Promise<ConciergeOrder> {
    return this.one(seesAll(c) ? {} : { makerId: c.staffId }, id);
  }

  async staffList(c: StaffCaller, q: { cursor?: string; limit?: number }): Promise<Page<ConciergeOrder>> {
    return this.page(seesAll(c) ? {} : { makerId: c.staffId }, q);
  }

  /** E-36: open orders due by the end of the window (the week by default), late ones first. */
  async due(c: StaffCaller, q: { from?: string; to?: string; cursor?: string; limit?: number }): Promise<Page<ConciergeOrder>> {
    const now = this.clock.now();
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const weekEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (7 - ((now.getUTCDay() + 6) % 7))));
    const to = q.to ?? day(new Date(weekEnd.getTime() - 86_400_000));
    if (q.from && q.from > to) throw AppError.validation({ from: "Must not be after the end date." });
    const until = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000);
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 50);
    const pos = q.cursor ? decodeCursor(q.cursor) : null;
    const maker = seesAll(c) ? Prisma.empty : Prisma.sql`AND o."makerId" = ${c.staffId}::uuid`;
    const from = q.from ? Prisma.sql`AND e."dueAt" >= ${new Date(`${q.from}T00:00:00.000Z`)}` : Prisma.empty;
    const after = pos ? Prisma.sql`AND (e."dueAt", o.id) > (${new Date(String(pos.key))}, ${pos.id}::uuid)` : Prisma.empty;
    const rows = await this.db.$queryRaw<{ id: string; dueAt: Date }[]>`
      SELECT o.id::text AS id, e."dueAt" FROM concierge_order o JOIN concierge_order_ext e ON e."orderId" = o.id
       WHERE o.status IN ('paid', 'making') AND e."dueAt" IS NOT NULL AND e."dueAt" < ${until} ${from} ${maker} ${after}
       ORDER BY e."dueAt", o.id LIMIT ${limit + 1}`;
    const page = toPage(rows, limit, (r) => ({ key: r.dueAt.toISOString(), id: r.id }));
    const orders = await this.db.conciergeOrder.findMany({ where: { id: { in: page.items.map((r) => r.id) } } });
    const byId = new Map(orders.map((o) => [o.id, o]));
    const items = await this.wire(page.items.map((r) => byId.get(r.id)).filter((o): o is OrderRow => !!o));
    return { items, nextCursor: page.nextCursor };
  }

  /** E-69: the makers and how many open orders each has (a maker sees only themselves). */
  async makers(c: StaffCaller, q: { cursor?: string; limit?: number }): Promise<Page<Maker>> {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 50);
    const pos = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.db.staffAccount.findMany({
      where: { roles: { has: "maker" }, status: "active", ...(seesAll(c) ? {} : { id: c.staffId }), ...(pos ? { id: { gt: pos.id } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: 0, id: r.id }));
    const open = await this.db.conciergeOrder.groupBy({
      by: ["makerId"],
      where: { makerId: { in: page.items.map((r) => r.id) }, status: { in: ["paid", "given", "making"] } },
      _count: { _all: true },
    });
    const n = new Map(open.map((r) => [r.makerId, r._count._all]));
    return { items: page.items.map((r) => ({ id: r.id, name: r.name, open: n.get(r.id) ?? 0 })), nextCursor: page.nextCursor };
  }

  /** E-35: ops or owner set a price on an order that is not paid yet. */
  async quote(id: string, body: { quoteKobo: number; reason: string }, actor: AuditActor): Promise<ConciergeOrder> {
    const reason = requireReason(body.reason);
    if (!Number.isSafeInteger(body.quoteKobo) || body.quoteKobo < 0) throw AppError.validation({ quoteKobo: "Must be a whole number of kobo, 0 or more." });
    await this.db.$transaction(async (tx) => {
      const o = await this.lock(tx, id, {});
      if (!canMove(o.status, "quoted")) throw AppError.conflict("order_not_quotable", "Only an order that is not paid yet can be priced.");
      // CB5: while a payment for this order is pending its price cannot move (the start's own check locked this row first, so the two never pass each other)
      const pending = await tx.payment.findFirst({ where: { purpose: "concierge", subjectId: id, status: "pending" }, select: { id: true } });
      if (pending) throw AppError.conflict("payment_pending", "A payment for this order is under way. Try again when it ends.");
      // CB3 (PROVISIONAL): a quote is at most 100 times the order's list price
      const list = (await tx.$queryRaw<{ listKobo: bigint }[]>`SELECT "listKobo" FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`)[0]?.listKobo ?? 0n;
      if (BigInt(body.quoteKobo) > list * 100n) throw AppError.validation({ quoteKobo: "A price is at most 100 times the list price of this order." });
      await tx.conciergeOrder.update({ where: { id }, data: { quoteKobo: BigInt(body.quoteKobo), status: "quoted" } });
      await tx.$executeRaw`UPDATE concierge_order_ext SET "amountKobo" = ${BigInt(body.quoteKobo)} WHERE "orderId" = ${id}::uuid`;
      await this.audit.write(tx, { actor, section: SECTION, action: "concierge.quote", target: { type: "ConciergeOrder", id }, reason, changedFields: ["quoteKobo", "status"] });
    });
    return this.one({}, id);
  }

  /**
   * E-39: gives a paid order to a maker, or gives it again to another with a reason. Two staff giving at once: the order is read
   * before the lock and checked again under it, so the one that finds the order changed since it looked gets 409 order_changed.
   */
  async give(id: string, body: { maker?: string; makerId?: string; expectedMaker?: string; reason?: string }, actor: AuditActor): Promise<ConciergeOrder> {
    const reason = requireReason(body.reason);
    const makerId = (body.makerId ?? body.maker ?? "").trim();
    if (!UUID.test(makerId)) throw AppError.validation({ maker: "Pick a maker." });
    if (!UUID.test(id)) throw AppError.notFound();
    // HG1: the maker the staff member saw on the order ("" when it had none); the give is refused when the order's maker is another
    if (typeof body.expectedMaker !== "string") throw AppError.validation({ expectedMaker: "Send the maker you saw on this order, or an empty value when it had none." });
    const expected = body.expectedMaker.trim().toLowerCase();
    if (expected !== "" && !UUID.test(expected)) throw AppError.validation({ expectedMaker: "Send the maker you saw on this order, or an empty value when it had none." });
    const seen = await this.db.conciergeOrder.findUnique({ where: { id }, select: { status: true, makerId: true } });
    if (!seen) throw AppError.notFound();
    await this.db.$transaction(async (tx) => {
      const o = await this.lock(tx, id, {});
      if (o.status !== seen.status || (o.makerId ?? "") !== expected) throw AppError.conflict("order_changed", "Someone else changed this order. Look again.");
      if (!canMove(o.status, "given")) throw AppError.conflict("order_not_paid", "Only a paid order can be given to a maker.");
      const maker = await tx.staffAccount.findUnique({ where: { id: makerId } });
      if (!maker || maker.status !== "active" || !maker.roles.includes("maker")) throw AppError.validation({ maker: "Pick a maker." });
      if (o.makerId === makerId) throw AppError.conflict("already_with_maker", "This order is already with that maker.");
      await tx.conciergeOrder.update({ where: { id }, data: { makerId, status: "given" } });
      await tx.$executeRaw`UPDATE concierge_order_ext SET "givenAt" = ${this.clock.now()} WHERE "orderId" = ${id}::uuid`;
      await this.audit.write(tx, {
        actor, section: SECTION, action: o.makerId ? "concierge.give-again" : "concierge.give", target: { type: "ConciergeOrder", id }, reason,
        changedFields: ["makerId", "status"],
      });
    });
    return this.one({}, id);
  }

  /** E-34: the order's own maker (or the owner) marks it delivered with the wishes made. They must be real wishes of the buyer. */
  async deliver(c: StaffCaller, id: string, body: { reason: string; wishIds: string[] }, actor: AuditActor): Promise<ConciergeOrder> {
    const reason = requireReason(body.reason);
    if (!UUID.test(id)) throw AppError.notFound();
    const mine = seesAll(c) ? {} : { makerId: c.staffId };
    const wishIds = [...new Set(body.wishIds.map((w) => w.trim().toLowerCase()))];
    if (wishIds.some((w) => !UUID.test(w))) throw AppError.validation({ wishIds: "Name wishes by their ids." });
    await this.db.$transaction(async (tx) => {
      const o = await this.lock(tx, id, mine);
      if (!canMove(o.status, "delivered")) throw AppError.conflict("order_not_being_made", "Only an order that is with a maker can be delivered.");
      if (wishIds.length > o.count) throw AppError.validation({ wishIds: `This order is for ${o.count} wish${o.count === 1 ? "" : "es"}.` });
      const wishes = await tx.wish.findMany({
        where: { id: { in: wishIds }, accountId: o.accountId, erasedAt: null, removedAt: null, status: { in: ["sealed", "live"] }, ...(o.businessId ? { businessId: o.businessId } : {}) },
        select: { id: true },
      });
      if (wishes.length !== wishIds.length) {
        const drafts = await tx.wish.findMany({ where: { id: { in: wishIds }, accountId: o.accountId, status: "draft" }, select: { id: true } });
        if (drafts.length) throw AppError.validation({ wishIds: `A draft is not made yet: ${drafts.map((d) => d.id).join(", ")}. Seal it first.` });
        throw AppError.validation({ wishIds: "Every wish must be one made for this order's buyer." });
      }
      const now = this.clock.now();
      try {
        for (const w of wishIds) {
          await tx.$executeRaw`INSERT INTO concierge_order_wish ("orderId", "wishId", "deliveredAt") VALUES (${id}::uuid, ${w}::uuid, ${now})`;
        }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError || (e as { code?: string }).code === "P2010") {
          throw AppError.validation({ wishIds: "A wish is delivered for one order only." });
        }
        throw e;
      }
      await tx.conciergeOrder.update({ where: { id }, data: { status: "delivered" } });
      await tx.$executeRaw`UPDATE concierge_order_ext SET "deliveredAt" = ${now} WHERE "orderId" = ${id}::uuid`;
      // CA3: one email to the customer, once per order (the key), counting the wishes and naming no receiver
      await this.notices.send(tx, {
        template: "concierge-delivered", toAccountId: o.accountId, key: `concierge-delivered:${id}`,
        data: { count: `${wishIds.length} wish${wishIds.length === 1 ? "" : "es"}` },
      });
      await this.audit.write(tx, { actor, section: SECTION, action: "concierge.deliver", target: { type: "ConciergeOrder", id }, reason, changedFields: ["status", "wishes"] });
    });
    return this.one({}, id);
  }

  /** Staff (ops, owner) cancel an order from any state that is not an end, with a reason and an audit row. */
  async cancelStaff(id: string, body: { reason?: string }, actor: AuditActor): Promise<ConciergeOrder> {
    const reason = requireReason(body.reason);
    await this.db.$transaction(async (tx) => {
      const o = await this.lock(tx, id, {});
      await this.cancelLocked(tx, o, actor, reason);
    });
    return this.one({}, id);
  }

  // ---------------------------------------------------------------- inside

  private async cancelLocked(tx: Tx, o: OrderRow, actor: AuditActor | null, reason: string | null): Promise<void> {
    if (!canMove(o.status, "cancelled")) throw AppError.conflict("order_ended", "This order is already finished.");
    const now = this.clock.now();
    await tx.conciergeOrder.update({ where: { id: o.id }, data: { status: "cancelled" } });
    const ext = (await tx.$queryRaw<Ext[]>`UPDATE concierge_order_ext SET "cancelledAt" = ${now} WHERE "orderId" = ${o.id}::uuid RETURNING "paymentId"::text AS "paymentId"`)[0];
    // paid: a person sends the refund, so the payment says so (the refund itself is not made here)
    if (ext?.paymentId) {
      await flagRefundDue(tx, ext.paymentId, "concierge_cancelled");
    }
    if (actor) {
      await this.audit.write(tx, { actor, section: SECTION, action: "concierge.cancel", target: { type: "ConciergeOrder", id: o.id }, reason, changedFields: ["status"] });
    }
  }

  /** The paid line: the order moves to paid with the payment named on it, once. A payment that cannot be matched is flagged for a refund. */
  private async settle(ctx: FulfilmentContext): Promise<void> {
    const { tx, payment } = ctx;
    const orderId = ctx.request.subjectId ?? payment.subjectId ?? "";
    const refuse = async (why: string) => {
      await flagRefundDue(tx, payment.id, why);
    };
    if (!UUID.test(orderId)) return refuse("order_missing");
    const rows = await tx.$queryRaw<OrderRow[]>`SELECT * FROM concierge_order WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!rows[0]) return refuse("order_missing");
    const ext = (await tx.$queryRaw<Ext[]>`SELECT "orderId"::text AS "orderId", "amountKobo", "paymentId"::text AS "paymentId" FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`)[0];
    if (ext?.paymentId === payment.id) return;
    const o = await tx.conciergeOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (!ext || o.accountId !== payment.accountId) return refuse("order_not_payers");
    if (!canMove(o.status, "paid")) return refuse("order_not_open");
    if (ext.amountKobo !== payment.amountKobo) return refuse("amount_mismatch");
    const now = this.clock.now();
    const grant = await ctx.grant();
    const hours = typeof grant.deliveryHours === "number" ? grant.deliveryHours : null;
    const dueAt = dueAtFor(o.kind, now, hours);
    await tx.conciergeOrder.update({ where: { id: orderId }, data: { status: "paid", deliverBy: dueAt } });
    await tx.$executeRaw`UPDATE concierge_order_ext SET "paymentId" = ${payment.id}::uuid, "paidAt" = ${now}, "dueAt" = ${dueAt} WHERE "orderId" = ${orderId}::uuid`;
    // CA3 (T-40): a business's order leaves an invoice, linked on the order; a person's payment names no business and leaves none.
    const invoiceId = await this.invoices.issue(tx, payment);
    if (invoiceId) await tx.conciergeOrder.update({ where: { id: orderId }, data: { invoiceId } });
  }

  /** Locks the order's row (FOR UPDATE) when it matches the filter; a miss is 404, a uuid that is not one is 404. */
  private async lock(tx: Tx, id: string, where: { accountId?: string; makerId?: string }): Promise<OrderRow> {
    if (!UUID.test(id)) throw AppError.notFound();
    const acc = where.accountId ? Prisma.sql`AND "accountId" = ${where.accountId}::uuid` : Prisma.empty;
    const mk = where.makerId ? Prisma.sql`AND "makerId" = ${where.makerId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM concierge_order WHERE id = ${id}::uuid ${acc} ${mk} FOR UPDATE`;
    if (!rows[0]) throw AppError.notFound();
    return tx.conciergeOrder.findUniqueOrThrow({ where: { id } });
  }

  private async hasPass(tx: Tx, accountId: string, now: Date): Promise<boolean> {
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM pass_membership p WHERE p."accountId" = ${accountId}::uuid AND p.state = 'active' AND p.since <= ${now}::timestamptz
         AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz LIMIT 1`;
    return rows.length > 0;
  }

  private async one(where: { accountId?: string; makerId?: string }, id: string): Promise<ConciergeOrder> {
    if (!UUID.test(id)) throw AppError.notFound();
    const row = await this.db.conciergeOrder.findFirst({ where: { id, ...where } });
    if (!row) throw AppError.notFound();
    return (await this.wire([row]))[0];
  }

  private async page(where: { accountId?: string; makerId?: string }, q: { cursor?: string; limit?: number }): Promise<Page<ConciergeOrder>> {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 50);
    const pos = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.db.conciergeOrder.findMany({ where: { ...where, ...(pos ? { id: { lt: pos.id } } : {}) }, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: 0, id: r.id }));
    return { items: await this.wire(page.items), nextCursor: page.nextCursor };
  }

  /** The orders on the wire. `record` is the report: for each delivered wish whether it was opened (counted from the receiver's opens). */
  private async wire(rows: OrderRow[]): Promise<ConciergeOrder[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const now = this.clock.now();
    const exts = await this.db.$queryRaw<Ext[]>`
      SELECT "orderId"::text AS "orderId", "amountKobo", "listKobo", "paymentId"::text AS "paymentId", "paidAt", "dueAt", "givenAt", "deliveredAt", "cancelledAt"
        FROM concierge_order_ext WHERE "orderId" = ANY(${ids}::uuid[])`;
    const ext = new Map(exts.map((e) => [e.orderId, e]));
    const links = await this.db.$queryRaw<{ orderId: string; wishId: string }[]>`
      SELECT "orderId"::text AS "orderId", "wishId"::text AS "wishId" FROM concierge_order_wish WHERE "orderId" = ANY(${ids}::uuid[]) ORDER BY "deliveredAt", "wishId"`;
    const wishIds = links.map((l) => l.wishId);
    const [acts, opened, makers, businesses] = await Promise.all([
      this.activity.summary(wishIds),
      this.db.wish.findMany({ where: { id: { in: wishIds } }, select: { id: true, openedAt: true } }),
      this.db.staffAccount.findMany({ where: { id: { in: rows.map((r) => r.makerId).filter((m): m is string => !!m) } }, select: { id: true, name: true } }),
      this.db.business.findMany({ where: { id: { in: rows.map((r) => r.businessId).filter((b): b is string => !!b) } }, select: { id: true, name: true } }),
    ]);
    const firstOpen = new Map(opened.map((w) => [w.id, w.openedAt]));
    const makerName = new Map(makers.map((m) => [m.id, m.name]));
    const bizName = new Map(businesses.map((b) => [b.id, b.name]));
    return rows.map((r): ConciergeOrder => {
      const e = ext.get(r.id);
      const mine = links.filter((l) => l.orderId === r.id).map((l) => {
        const a = acts.get(l.wishId);
        const first = firstOpen.get(l.wishId) ?? null;
        return { wishId: l.wishId, opened: (a?.opens ?? 0) > 0 || (a?.plays ?? 0) > 0 || first !== null, opens: a?.opens ?? 0, plays: a?.plays ?? 0, firstOpenedAt: first ? toWireInstant(first) : null };
      });
      const open = OPEN.includes(r.status);
      const dueAt = e?.dueAt ?? null;
      const wire: ConciergeOrder & { dueAt: string | null; late: boolean; wishIds: string[] } = {
        accountId: r.accountId,
        amount: Number(r.quoteKobo ?? e?.amountKobo ?? 0n),
        brief: r.brief,
        businessId: r.businessId,
        count: r.count,
        createdAt: toWireInstant(r.createdAt),
        deliverBy: dueAt ? toWireInstant(dueAt) : null,
        due: [],
        from: (r.businessId ? bizName.get(r.businessId) : null) ?? "Customer",
        id: r.id,
        invoiceId: r.invoiceId,
        kind: r.kind,
        makerId: r.makerId,
        makerName: (r.makerId ? makerName.get(r.makerId) : null) ?? "",
        names: [],
        namesFileId: r.namesFileId,
        nextDate: null,
        occasion: "",
        person: null,
        placed: toWireInstant(r.createdAt),
        quoteKobo: r.quoteKobo === null ? null : Number(r.quoteKobo),
        reason: "",
        record: mine,
        reportFileId: r.reportFileId,
        rush: false,
        shape: r.kind,
        state: stateOf(r.status),
        status: r.status,
        to: toWireInstant(dueAt ?? r.createdAt),
        updatedAt: toWireInstant(r.updatedAt),
        dueAt: dueAt ? toWireInstant(dueAt) : null,
        late: open && dueAt !== null && dueAt.getTime() < now.getTime(),
        wishIds: mine.map((m) => m.wishId),
      };
      return wire;
    });
  }
}
