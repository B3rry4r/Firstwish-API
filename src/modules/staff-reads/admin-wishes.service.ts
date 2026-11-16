import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AppError } from "../../common/errors/app-error";
import { RateLimited } from "../../common/errors/rate-limited";
import { Clock } from "../../common/ports/clock.port";
import { decodeCursor, DEFAULT_LIMIT, type Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { Wish, WishDetail } from "../../contracts";
import { type AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { JobsService } from "../jobs/jobs.service";
import { NoticesService } from "../notices/notices.service";
import { RefundsService } from "../refunds/refunds.service";
import { WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { stateOf } from "../wishes/wish-state";
import { requireActionRole, WISH_ACTION_ROLES } from "./action-roles";
import { UUID } from "./mask";
import { maskEmail, paymentWire, wishWire } from "./wire";

const SECTION = "/admin/wishes";
const DAY = 86_400_000;
/** The days "extend" adds as goodwill (the admin app's own number, 7). */
export const GOODWILL_DAYS = 7;
/** Most days staff may add to one wish in all, and most times they may send its link again in a UTC day (FC2, provisional). */
export const MAX_EXTEND_DAYS = 30;
export const MAX_RESENDS_PER_DAY = 3;
export const WISH_ACTIONS = ["take_down", "restore", "extend", "resend", "refund"] as const;
type WishAction = (typeof WISH_ACTIONS)[number];
const NO = /^[0-9A-Za-z-]{1,24}$/;
const WEB_STATES = ["draft", "sealed", "live", "resting", "down", "erased"];

/** Staff reads and actions on wishes (E-218 to E-220). A wish's own words and photos are never in these answers. */
@Injectable()
export class AdminWishesService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly lifecycle: WishLifecycleService,
    private readonly jobs: JobsService,
    private readonly notices: NoticesService,
    private readonly refunds: RefundsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async links(wishIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!wishIds.length) return out;
    const rows = await this.db.wishLink.findMany({ where: { wishId: { in: wishIds } }, orderBy: [{ active: "desc" }, { id: "desc" }] });
    for (const l of rows) if (!out.has(l.wishId)) out.set(l.wishId, l.slug);
    return out;
  }

  private async listed(wishIds: string[]): Promise<Set<string>> {
    if (!wishIds.length) return new Set();
    const rows = await this.db.publishedWish.findMany({ where: { wishId: { in: wishIds } }, select: { wishId: true } });
    return new Set(rows.map((r) => r.wishId).filter((x): x is string => !!x));
  }

  /** E-218: newest first. `q` is a wish number, a link (the whole address or its last part) or the sender's email; `state` narrows by state. */
  async list(q: { q?: string; state?: string; cursor?: string; limit?: number }): Promise<Page<Wish>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    if (q.state && !WEB_STATES.includes(q.state)) throw AppError.validation({ state: `Must be one of ${WEB_STATES.join(", ")}.` });
    const and: Prisma.WishWhereInput[] = [];
    const t = q.q?.trim();
    if (t) {
      const slug = t.replace(/^.*\/w\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
      const no = t.replace(/^#|^no\.?\s*/i, "");
      const byLink = await this.db.wishLink.findMany({ where: { slug }, select: { wishId: true } });
      and.push({
        OR: [
          { no },
          ...(byLink.length ? [{ id: { in: byLink.map((l) => l.wishId) } }] : []),
          ...(t.includes("@") ? [{ account: { contact: t.toLowerCase() } }] : []),
        ],
      });
    }
    if (q.state === "down") and.push({ status: "removed", erasedAt: null });
    else if (q.state === "erased") and.push({ erasedAt: { not: null } });
    else if (q.state) and.push({ status: q.state as "draft" | "sealed" | "live" | "resting", erasedAt: null });
    if (q.cursor) {
      const id = decodeCursor(q.cursor).id;
      if (!UUID.test(id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      and.push({ id: { lt: id } });
    }
    const rows = await this.db.wish.findMany({ where: { AND: and }, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    const ids = page.items.map((w) => w.id);
    const [links, listed, people] = await Promise.all([
      this.links(ids),
      this.listed(ids),
      this.db.account.findMany({ where: { id: { in: page.items.map((w) => w.accountId) } }, select: { id: true, name: true } }),
    ]);
    const names = new Map(people.map((p) => [p.id, p.name ?? ""]));
    return {
      items: page.items.map((w) => ({ ...wishWire(w, links.get(w.id) ?? null, listed.has(w.id)), personName: names.get(w.accountId) ?? "" })) as unknown as Wish[],
      nextCursor: page.nextCursor,
    };
  }

  private async findByNo(no: string) {
    if (!NO.test(no)) throw AppError.notFound("No such wish.");
    const w = await this.db.wish.findUnique({ where: { no } });
    if (!w) throw AppError.notFound("No such wish.");
    return w;
  }

  /** E-219: the wish with its state, term, payments and delivery (the messages sent about it). */
  async detail(no: string): Promise<WishDetail> {
    const w = await this.findByNo(no);
    const [links, listed, owner, transitions, audits, payments, notices] = await Promise.all([
      this.links([w.id]),
      this.listed([w.id]),
      this.db.account.findUnique({ where: { id: w.accountId } }),
      this.db.wishTransition.findMany({ where: { wishId: w.id }, orderBy: { id: "asc" } }),
      this.db.auditEntry.findMany({ where: { subjectType: "Wish", subjectId: w.id }, orderBy: { id: "asc" } }),
      this.db.payment.findMany({ where: { subjectId: w.id }, orderBy: { id: "desc" } }),
      this.db.notice.findMany({ where: { wishId: w.id, deliveryId: { not: null } }, select: { deliveryId: true } }),
    ]);
    const deliveryIds = notices.map((n) => n.deliveryId).filter((x): x is string => !!x);
    const msgs = await this.db.messageDelivery.findMany({
      where: { OR: [{ id: { in: deliveryIds } }, { vars: { path: ["wishId"], equals: w.id } }] },
      orderBy: { id: "desc" },
    });
    const staff = audits.length ? await this.db.staffAccount.findMany({ where: { id: { in: audits.map((a) => a.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [];
    const staffName = new Map(staff.map((s) => [s.id, s.name]));
    const timeline = [
      ...transitions.map((t) => ({ at: toWireInstant(t.createdAt), ms: t.createdAt.getTime(), what: `${t.from} to ${t.to}`, by: t.cause })),
      ...audits.map((a) => ({ at: toWireInstant(a.createdAt), ms: a.createdAt.getTime(), what: a.action, ...(a.actorId && staffName.get(a.actorId) ? { by: staffName.get(a.actorId) } : {}), ...(a.reason ? { reason: a.reason } : {}) })),
    ].sort((x, y) => x.ms - y.ms).map(({ ms: _ms, ...rest }) => rest);
    return {
      wish: wishWire(w, links.get(w.id) ?? null, listed.has(w.id), timeline),
      person: owner ? { id: owner.id, name: owner.name ?? "" } : null,
      payments: payments.map((p) => paymentWire(p, no)),
      messages: msgs.map((m) => ({ id: m.id, what: m.templateKey, channel: "email", to: maskEmail(m.to), state: m.status, at: toWireInstant(m.createdAt), wish: no })),
    };
  }

  /** E-220: one action, one reason, one audit row in the same transaction as the change (a refund's row is written by the refund itself). */
  async act(no: string, action: string, reasonText: string, actor: AuditActor, isOwner: boolean, roles: readonly string[]): Promise<WishDetail> {
    requireActionRole(WISH_ACTION_ROLES, action, roles);
    const reason = requireReason(reasonText);
    if (!WISH_ACTIONS.includes(action as WishAction)) throw AppError.validation({ action: `Must be one of ${WISH_ACTIONS.join(", ")}.` });
    const found = await this.findByNo(no);
    if (action === "refund") {
      const pay = await this.db.payment.findFirst({ where: { subjectId: found.id, purpose: "ticket", status: "succeeded" }, orderBy: { id: "desc" } });
      if (!pay) throw AppError.conflict("not_allowed", "This wish has no paid ticket to refund.");
      await this.refunds.startAndSend(pay.providerReference, reason, actor, isOwner);
      return this.detail(no);
    }
    await this.db.$transaction(async (tx) => {
      const w = await this.lifecycle.lock(tx, found.id);
      const now = this.clock.now();
      const state = stateOf(w);
      const termEnd = async (cause: string): Promise<void> => {
        const days = await this.lifecycle.restoreDays(tx);
        const endsAt = new Date(now.getTime() + days * DAY);
        await this.lifecycle.move(tx, w, "live", { cause, data: { endsAt, restingSince: null, eraseAfter: null } });
        await this.jobs.cancel("erase-wish", w.id, tx);
        await this.jobs.cancel("restore-window-end", w.id, tx);
        await this.jobs.schedule("rest-wish", endsAt, w.id, tx);
      };
      let changed: string[] = ["status"];
      if (action === "take_down") {
        await this.lifecycle.move(tx, w, "taken_down", { cause: "staff-take-down" });
      } else if (action === "restore") {
        if (state === "resting") await this.lifecycle.restoreResting(tx, w, "staff-restore");
        else if (state === "taken_down") {
          const to = await this.lifecycle.stateBeforeTakeDown(tx, w.id);
          const open = w.endsAt === null || w.endsAt.getTime() > now.getTime();
          if ((to === "live" || to === "resting") && !open) await termEnd("staff-restore");
          else {
            await this.lifecycle.move(tx, w, to, { cause: "staff-restore" });
            if (to === "sealed" && w.opensAt) await this.jobs.schedule("open-wish", w.opensAt, w.id, tx);
            if ((to === "live" || to === "resting") && w.endsAt && open) await this.jobs.schedule("rest-wish", w.endsAt, w.id, tx);
          }
        } else throw AppError.conflict("not_allowed", `A wish that is ${state.replace("_", " ")} has nothing to restore.`);
      } else if (action === "extend") {
        if (state === "resting" || state === "live") {
          const [used] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM audit_entry WHERE action = 'wish.extend' AND "subjectType" = 'Wish' AND "subjectId" = ${w.id}`;
          if ((Number(used.n) + 1) * GOODWILL_DAYS > MAX_EXTEND_DAYS) throw AppError.conflict("not_allowed", `Staff can add at most ${MAX_EXTEND_DAYS} days in all to one wish.`);
        }
        if (state === "resting") await termEnd("staff-extend");
        else if (state === "live") {
          const base = w.endsAt && w.endsAt.getTime() > now.getTime() ? w.endsAt : now;
          const endsAt = new Date(base.getTime() + GOODWILL_DAYS * DAY);
          await tx.wish.update({ where: { id: w.id }, data: { endsAt, version: { increment: 1 } } });
          await this.jobs.schedule("rest-wish", endsAt, w.id, tx);
          changed = ["endsAt"];
        } else throw AppError.conflict("not_allowed", `A wish that is ${state.replace("_", " ")} has no term to extend.`);
      } else if (action === "resend") {
        if (state !== "sealed" && state !== "live") throw AppError.conflict("not_allowed", `A wish that is ${state.replace("_", " ")} has no link to send.`);
        const [row, link] = await Promise.all([
          tx.wish.findUniqueOrThrow({ where: { id: w.id }, select: { name: true, accountId: true } }),
          tx.wishLink.findFirst({ where: { wishId: w.id, active: true }, orderBy: { id: "desc" } }),
        ]);
        if (!link) throw AppError.conflict("not_allowed", "This wish has no link yet.");
        const [sent] = await tx.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM audit_entry WHERE action = 'wish.resend' AND "subjectType" = 'Wish' AND "subjectId" = ${w.id}
            AND "createdAt" >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;
        if (Number(sent.n) >= MAX_RESENDS_PER_DAY) throw new RateLimited(3600, "This link has been sent again as often as allowed today. Try again tomorrow.");
        const owner = await tx.account.findUnique({ where: { id: row.accountId }, select: { name: true } });
        const out = await this.notices.send(tx, {
          template: "opens", toAccountId: row.accountId, wishId: w.id, key: `staff-resend:${w.id}:${actor.requestId}`,
          data: { name: owner?.name ?? "", for: row.name ?? "", link: `${this.env.PUBLIC_SITE_URL.replace(/\/+$/, "")}/w/${link.slug}` },
        });
        if (out.status === "skipped") throw AppError.conflict("not_allowed", "The sender cannot be written to.");
        changed = ["message"];
      }
      await this.audit.write(tx, { actor, section: SECTION, action: `wish.${action}`, target: { type: "Wish", id: w.id }, reason, changedFields: changed });
    });
    return this.detail(no);
  }
}
