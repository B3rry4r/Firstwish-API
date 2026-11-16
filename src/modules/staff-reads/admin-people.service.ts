import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { RateLimited } from "../../common/errors/rate-limited";
import { Clock } from "../../common/ports/clock.port";
import { decodeCursor, DEFAULT_LIMIT, type Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { Account, PersonDetail } from "../../contracts";
import { AccountErasureService } from "../accounts/account-erasure.service";
import { type AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { BansService } from "../moderation/bans.service";
import { PERSON_ACTION_ROLES, requireActionRole } from "./action-roles";
import { UUID } from "./mask";
import { maskEmail, maskPhone, paymentWire, wishWire } from "./wire";

/** E-4: 20 reveals an hour for one staff member, counted in the database (PROVISIONAL, listed to the owner). */
export const REVEALS_PER_HOUR = 20;
const SECTION = "/admin/people";

/** Staff reads and actions on people (E-1 to E-4). Contact details are masked everywhere except the audited reveal. */
@Injectable()
export class AdminPeopleService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly bans: BansService,
    private readonly erasure: AccountErasureService,
  ) {}

  private async person(a: Prisma.AccountGetPayload<object>) {
    const now = this.clock.now();
    const [ban, pass, record, wishCount] = await Promise.all([
      this.db.ban.findFirst({ where: { accountId: a.id, OR: [{ until: null }, { until: { gt: now } }] }, orderBy: { id: "desc" } }),
      this.db.passMembership.findFirst({ where: { accountId: a.id }, orderBy: { id: "desc" } }),
      this.db.auditEntry.findMany({ where: { subjectType: "Account", subjectId: a.id }, orderBy: { id: "desc" }, take: 50 }),
      this.db.wish.count({ where: { accountId: a.id } }),
    ]);
    const staffIds = [...new Set([...record.map((r) => r.actorId), ban?.by].filter((x): x is string => !!x && UUID.test(x)))];
    const staff = staffIds.length ? await this.db.staffAccount.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }) : [];
    const name = new Map(staff.map((s) => [s.id, s.name]));
    const until = pass?.validUntil instanceof Date ? pass.validUntil : null;
    const side = (s: string) => ({ side: s === "person" ? "personal" : s, name: s === "business" ? (a.business ?? "") : (a.name ?? "") });
    return {
      id: a.id,
      name: a.name ?? "",
      phone: maskPhone(a.phone),
      email: maskEmail(a.contact),
      contact: maskEmail(a.contact),
      joined: toWireInstant(a.createdAt),
      sides: a.sides.map(side),
      pass: until ? { active: until.getTime() > now.getTime(), endsAt: toWireInstant(until) } : null,
      ban: ban ? { at: toWireInstant(ban.createdAt), by: name.get(ban.by) ?? "", reason: ban.reason } : null,
      erased: a.erasedAt !== null,
      wishCount,
      record: record.map((r) => ({ at: toWireInstant(r.createdAt), what: r.action, ...(r.actorId && name.get(r.actorId) ? { by: name.get(r.actorId) } : {}), ...(r.reason ? { reason: r.reason } : {}) })),
    };
  }

  /** E-1: newest first; `q` is a name, an email or an account id. */
  async list(q: { q?: string; cursor?: string; limit?: number }): Promise<Page<Account>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.AccountWhereInput = {};
    const t = q.q?.trim();
    if (t) where.OR = [{ name: { contains: t, mode: "insensitive" } }, { contact: { contains: t.toLowerCase() } }, ...(UUID.test(t) ? [{ id: t.toLowerCase() }] : [])];
    if (q.cursor) {
      const id = decodeCursor(q.cursor).id;
      if (!UUID.test(id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.id = { ...(typeof where.id === "object" ? where.id : {}), lt: id };
    }
    const rows = await this.db.account.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: (await Promise.all(page.items.map((a) => this.person(a)))) as unknown as Account[], nextCursor: page.nextCursor };
  }

  /** E-2: the person, their wishes and their payments. */
  async detail(id: string): Promise<PersonDetail> {
    if (!UUID.test(id)) throw AppError.notFound("No such person.");
    const a = await this.db.account.findUnique({ where: { id } });
    if (!a) throw AppError.notFound("No such person.");
    const [wishes, payments] = await Promise.all([
      this.db.wish.findMany({ where: { accountId: id }, orderBy: { id: "desc" }, take: 100 }),
      this.db.payment.findMany({ where: { accountId: id }, orderBy: { id: "desc" }, take: 100 }),
    ]);
    const links = wishes.length ? await this.db.wishLink.findMany({ where: { wishId: { in: wishes.map((w) => w.id) }, active: true }, orderBy: { id: "desc" } }) : [];
    const slug = new Map<string, string>();
    for (const l of links) if (!slug.has(l.wishId)) slug.set(l.wishId, l.slug);
    const nos = new Map(wishes.map((w) => [w.id, w.no ?? ""]));
    return {
      person: await this.person(a),
      wishes: wishes.map((w) => wishWire(w, slug.get(w.id) ?? null, false)),
      payments: payments.map((p) => paymentWire(p, p.subjectId ? nos.get(p.subjectId) : undefined)),
    };
  }

  /** E-3: ban (sign-in), lift (every ban in force) or erase. Each is one transaction with its audit row, written by the service that does it. */
  async act(id: string, action: string, reasonText: string, actor: AuditActor, roles: readonly string[]): Promise<PersonDetail> {
    requireActionRole(PERSON_ACTION_ROLES, action, roles);
    const reason = requireReason(reasonText);
    if (!UUID.test(id)) throw AppError.notFound("No such person.");
    if (!(await this.db.account.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound("No such person.");
    if (action === "ban") await this.bans.create({ accountId: id, reason, scope: "account" }, actor);
    else if (action === "lift") {
      const now = this.clock.now();
      const open = await this.db.ban.findMany({ where: { accountId: id, OR: [{ until: null }, { until: { gt: now } }] }, orderBy: { id: "asc" } });
      if (!open.length) throw AppError.conflict("not_banned", "This account has no ban in force.");
      for (const b of open) await this.bans.lift(b.id, actor, reason);
    } else if (action === "erase") await this.erasure.erase(id, { actor, reason });
    else throw AppError.validation({ action: "Must be ban, lift or erase." });
    return this.detail(id);
  }

  /**
   * E-4: the full phone and email of one account, for a reason. The caller's reveals in the last hour are counted in the database
   * while a lock on the staff member is held, so 50 at once let exactly 20 through; a database that cannot answer refuses the
   * reveal. One audit row, with field names only (never the values). Answers the values to the service's caller.
   */
  async reveal(id: string, reasonText: string, actor: AuditActor): Promise<{ phone: string; email: string }> {
    const reason = requireReason(reasonText);
    if (!UUID.test(id)) throw AppError.notFound("No such person.");
    const staffId = actor.id as string;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reveal:${staffId}`}, 0))`;
      const [used] = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM audit_entry WHERE action = 'person.contact_reveal' AND "actorId" = ${staffId}::uuid AND "createdAt" > now() - interval '1 hour'`;
      if (Number(used.n) >= REVEALS_PER_HOUR) throw new RateLimited(60, "You have used your reveals for this hour. Try again later.");
      const a = await tx.account.findUnique({ where: { id }, select: { contact: true, phone: true, erasedAt: true } });
      if (!a) throw AppError.notFound("No such person.");
      if (a.erasedAt) throw AppError.conflict("not_allowed", "This account was erased.");
      await this.audit.write(tx, { actor, section: SECTION, action: "person.contact_reveal", target: { type: "Account", id }, reason, changedFields: ["contact", "phone"] });
      return { phone: a.phone ?? "", email: a.contact ?? "" };
    });
  }
}
