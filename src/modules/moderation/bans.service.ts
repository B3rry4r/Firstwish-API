import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { Ban } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { ShowingService } from "../showing/showing.service";
import { activeBanScopes } from "./ban-rules";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ban: an account that may not sign in (scope account) or may not publish (scope publishing). */
@Injectable()
export class BansService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly showing: ShowingService,
  ) {}

  /** E-21: staff ban an account. A second ban of the same scope while one is in force is 409. */
  async create(body: { accountId: string; reason: string; scope: string }, actor: AuditActor): Promise<Ban> {
    const reason = requireReason(body.reason);
    if (body.scope !== "publishing" && body.scope !== "account") throw AppError.validation({ scope: "Must be publishing or account." });
    if (!UUID.test(body.accountId)) throw AppError.notFound("No such account.");
    return this.db.$transaction(async (tx) => {
      const row = await this.apply(tx, body.accountId, body.scope as "publishing" | "account", actor.id ?? "staff", reason);
      await this.audit.write(tx, {
        actor, section: "/admin/people", action: "ban.create", target: { type: "Account", id: body.accountId }, reason, changedFields: ["scope", "reason"],
      });
      return this.wire(row);
    });
  }

  /**
   * Writes a Ban row inside the caller's transaction: locks the account, refuses a repeat, ends the account's sessions for scope
   * account, and takes every listing of the account off Now showing for good (a lifted ban does not bring them back).
   */
  async apply(tx: Tx, accountId: string, scope: "publishing" | "account", by: string, reason: string): Promise<Prisma.BanGetPayload<object>> {
    if ((await lockAccount(tx, accountId, { allowErased: true })).erasedAt) throw AppError.conflict("not_allowed", "This account was erased.");
    const now = this.clock.now();
    if ((await activeBanScopes(tx, accountId, now)).includes(scope)) throw AppError.conflict("already_banned", "This account is already banned.");
    const row = await tx.ban.create({ data: { id: this.ids.id(), accountId, scope, reason, by, createdAt: now } });
    if (scope === "account") {
      await tx.session.updateMany({ where: { accountId, revokedAt: null }, data: { revokedAt: now, revokeReason: "banned" } });
    }
    const wishes = await tx.wish.findMany({ where: { accountId }, select: { id: true } });
    await this.showing.dropForWishes(tx, wishes.map((w) => w.id));
    return row;
  }

  /** Lifts a ban: sign-in works again; the listings it removed stay removed. No registry route calls it yet (see the hand-back). */
  async lift(banId: string, actor: AuditActor, reasonText: string): Promise<Ban> {
    const reason = requireReason(reasonText);
    if (!UUID.test(banId)) throw AppError.notFound("No such ban.");
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ accountId: string }[]>`SELECT "accountId"::text AS "accountId" FROM ban WHERE id = ${banId}::uuid`;
      if (!rows[0]) throw AppError.notFound("No such ban.");
      await lockAccount(tx, rows[0].accountId, { allowErased: true });
      const now = this.clock.now();
      const upd = await tx.ban.updateMany({ where: { id: banId, OR: [{ until: null }, { until: { gt: now } }] }, data: { until: now } });
      if (!upd.count) throw AppError.conflict("not_allowed", "This ban is not in force.");
      await this.audit.write(tx, {
        actor, section: "/admin/people", action: "ban.lift", target: { type: "Account", id: rows[0].accountId }, reason, changedFields: ["until"],
      });
      return this.wire(await tx.ban.findUniqueOrThrow({ where: { id: banId } }));
    });
  }

  wire(r: Prisma.BanGetPayload<object>): Ban {
    return { id: r.id, accountId: r.accountId, by: r.by, reason: r.reason, scope: r.scope, createdAt: toWireInstant(r.createdAt), until: r.until ? toWireInstant(r.until) : null };
  }
}
