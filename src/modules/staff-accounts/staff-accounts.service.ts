import { HttpStatus, Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Prisma, type StaffAccount as StaffRow, type StaffAccountRoles } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { normaliseEmail } from "../../common/normalise/email";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type {
  GetAdminTeamQuery,
  PatchAdminStaffAccountsByIdBody,
  PostAdminStaffAccountsByIdSuspendBody,
  PostAdminTeamByIdRemoveBody,
  PostAdminTeamInviteBody,
  StaffAccount,
} from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { StaffAuthService } from "./staff-auth.service";
import { isRemoved, STAFF_ROLES, staffToWire } from "./staff-view";

const TEAM = "/admin/team";
const notAllowed = (message: string) => new AppError(HttpStatus.CONFLICT, "not_allowed", message);

/** Roles from a request: at least one, each a staff role, none twice. */
function parseRoles(input: unknown, field: string, allowOwner: boolean): StaffAccountRoles[] {
  if (!Array.isArray(input) || input.length === 0) throw AppError.validation({ [field]: "Pick at least one role." });
  const out: StaffAccountRoles[] = [];
  for (const r of input) {
    if (typeof r !== "string" || !STAFF_ROLES.includes(r as StaffAccountRoles)) {
      throw AppError.validation({ [field]: `Each role is one of ${STAFF_ROLES.join(", ")}.` });
    }
    if (r === "owner" && !allowOwner) throw AppError.validation({ [field]: "An invite cannot give the owner role." });
    if (!out.includes(r as StaffAccountRoles)) out.push(r as StaffAccountRoles);
  }
  return out;
}

@Injectable()
export class StaffAccountsService implements OnApplicationBootstrap {
  private readonly log = new Logger("StaffAccounts");

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: StaffAuthService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** DEC-24: the first owner comes from STAFF_BOOTSTRAP_OWNER_EMAIL when the team has no owner at all. */
  async onApplicationBootstrap(): Promise<void> {
    const email = this.env.STAFF_BOOTSTRAP_OWNER_EMAIL ? normaliseEmail(this.env.STAFF_BOOTSTRAP_OWNER_EMAIL) : null;
    if (!email) return;
    try {
      await this.bootstrapOwner(email);
    } catch (e) {
      this.log.warn(`first owner not made: ${(e as Error).message}`);
    }
  }

  async bootstrapOwner(email: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fw:staff-bootstrap'))`;
      const owners = await tx.staffAccount.count({ where: { roles: { has: "owner" } } });
      if (owners > 0) return;
      const existing = await tx.staffAccount.findUnique({ where: { email } });
      const row = existing
        ? await tx.staffAccount.update({ where: { id: existing.id }, data: { roles: ["owner"], status: "active" } })
        : await tx.staffAccount.create({ data: { id: this.ids.id(), email, name: email.split("@")[0], roles: ["owner"], status: "active" } });
      await this.audit.write(tx, {
        actor: { type: "system", id: null, requestId: this.ids.id() },
        section: TEAM,
        action: "team.first-owner",
        target: { type: "StaffAccount", id: row.id },
        reason: null,
        changedFields: existing ? ["roles", "status"] : ["email", "name", "roles", "status"],
      });
    });
  }

  /** E-179: the team by name, cursor pages. */
  async team(q: GetAdminTeamQuery): Promise<Page<StaffAccount>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    let where: Prisma.StaffAccountWhereInput = {};
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (typeof c.key !== "string") throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where = { OR: [{ name: { gt: c.key } }, { name: c.key, id: { gt: c.id } }] };
    }
    const rows = await this.db.staffAccount.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.name, id: r.id }));
    return { items: page.items.map(staffToWire), nextCursor: page.nextCursor };
  }

  /** E-177: change a member's roles. The last active owner cannot be demoted. */
  async changeRoles(id: string, body: PatchAdminStaffAccountsByIdBody, actor: AuditActor): Promise<StaffAccount> {
    const reason = requireReason(body.reason);
    const roles = parseRoles(body.roles, "roles", true);
    const row = await this.db.$transaction(async (tx) => {
      const owners = await this.lockOwners(tx);
      const target = await this.lockOne(tx, id);
      if (isRemoved(target)) throw notAllowed("This member has been removed.");
      if (owners.includes(target.id) && !roles.includes("owner") && owners.length <= 1) {
        throw notAllowed("The last owner cannot be demoted.");
      }
      const updated = await tx.staffAccount.update({ where: { id: target.id }, data: { roles } });
      await this.audit.write(tx, { actor, section: TEAM, action: "team.change-roles", target: { type: "StaffAccount", id: target.id }, reason, changedFields: ["roles"] });
      return updated;
    });
    return staffToWire(row);
  }

  /** E-178: suspend a member; their sessions end at once. The last active owner cannot be suspended. */
  async suspend(id: string, body: PostAdminStaffAccountsByIdSuspendBody, actor: AuditActor): Promise<StaffAccount> {
    const reason = requireReason(body.reason);
    const row = await this.db.$transaction(async (tx) => {
      const owners = await this.lockOwners(tx);
      const target = await this.lockOne(tx, id);
      if (isRemoved(target)) throw notAllowed("This member has been removed.");
      if (target.status === "suspended") throw notAllowed("This member is already suspended.");
      if (owners.includes(target.id) && owners.length <= 1) throw notAllowed("The last owner cannot be suspended.");
      const updated = await tx.staffAccount.update({ where: { id: target.id }, data: { status: "suspended" } });
      await this.endSessions(tx, target.id, "suspended");
      await this.audit.write(tx, { actor, section: TEAM, action: "team.suspend", target: { type: "StaffAccount", id: target.id }, reason, changedFields: ["status"] });
      return updated;
    });
    return staffToWire(row);
  }

  /** E-180: remove a member: no sign-in from now on and every session ends at once. Refused for an owner or one already removed. */
  async remove(id: string, body: PostAdminTeamByIdRemoveBody, actor: AuditActor): Promise<void> {
    const reason = requireReason(body.reason);
    await this.db.$transaction(async (tx) => {
      await this.lockOwners(tx);
      const target = await this.lockOne(tx, id);
      if (target.roles.includes("owner")) throw notAllowed("An owner cannot be removed. Change their roles first.");
      if (isRemoved(target)) throw notAllowed("This member has already been removed.");
      await tx.staffAccount.update({ where: { id: target.id }, data: { status: "removed", roles: [] } });
      await this.endSessions(tx, target.id, "removed");
      await tx.authCode.updateMany({ where: { destination: target.email, purpose: "staff_sign_in", consumedAt: null }, data: { consumedAt: this.clock.now() } });
      await this.audit.write(tx, { actor, section: TEAM, action: "team.remove", target: { type: "StaffAccount", id: target.id }, reason, changedFields: ["status", "roles"] });
    });
  }

  /**
   * E-181: invite a member (never as owner); the server emails them a sign-in code. A removed member can be invited again: they
   * return as invited with the new roles (U5). Two invites at once for one email: one 201, the other 409 already_staff (U3).
   */
  async invite(body: PostAdminTeamInviteBody, actor: AuditActor): Promise<StaffAccount> {
    const reason = requireReason(body.reason);
    const asked: unknown = body.roles ?? (body.role === undefined ? undefined : [body.role]);
    const roles = parseRoles(asked, body.roles !== undefined ? "roles" : "role", false);
    const email = body.email;
    let row: StaffRow;
    try {
      row = await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-invite:${email}`}))`;
        const existing = await tx.staffAccount.findUnique({ where: { email } });
        if (existing && !isRemoved(existing)) throw AppError.conflict("already_staff", "That email is already on the team.");
        const saved = existing
          ? await tx.staffAccount.update({ where: { id: existing.id }, data: { roles, status: "invited" } })
          : await tx.staffAccount.create({ data: { id: this.ids.id(), email, name: email.split("@")[0], roles, status: "invited" } });
        await this.audit.write(tx, {
          actor,
          section: TEAM,
          action: existing ? "team.re-invite" : "team.invite",
          target: { type: "StaffAccount", id: saved.id },
          reason,
          changedFields: existing ? ["roles", "status"] : ["email", "name", "roles", "status"],
        });
        return saved;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw AppError.conflict("already_staff", "That email is already on the team.");
      }
      throw e;
    }
    await this.auth.inviteCode(row);
    return staffToWire(row);
  }

  /** Locks every active owner row (always taken first, then the target, so two owner changes never cross). */
  private async lockOwners(tx: Prisma.TransactionClient): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM staff_account
      WHERE status = 'active' AND 'owner' = ANY(roles::text[])
      ORDER BY id FOR UPDATE`;
    return rows.map((r) => r.id);
  }

  private async lockOne(tx: Prisma.TransactionClient, id: string): Promise<StaffRow> {
    if (!isUuidV7(id)) throw AppError.notFound("No such team member.");
    await tx.$queryRaw`SELECT id FROM staff_account WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.staffAccount.findUnique({ where: { id } });
    if (!row) throw AppError.notFound("No such team member.");
    return row;
  }

  private async endSessions(tx: Prisma.TransactionClient, staffId: string, why: string): Promise<void> {
    await tx.session.updateMany({ where: { staffId, revokedAt: null }, data: { revokedAt: this.clock.now(), revokeReason: why } });
  }
}
