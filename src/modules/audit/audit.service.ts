import { Injectable } from "@nestjs/common";
import { Prisma, type AuditEntry as AuditRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { AuditEntry, GetAdminAuditQuery } from "../../contracts";
import { networkOf } from "./ip-network";

/** Who did it. A staff action names the staff id; the address is cut to its network before it is stored. */
export interface AuditActor {
  type: "staff" | "account" | "system";
  id: string | null;
  ip?: string | null;
  requestId: string;
}

/** One audit row. Ids and field names only, never personal values (Q9). */
export interface AuditInput {
  actor: AuditActor;
  /** The admin section of the action, as the role table names it ("/admin/team"). */
  section: string;
  /** What was done, such as "team.invite". */
  action: string;
  target: { type: string; id: string };
  /** The staff member's reason (4 or more characters, A14). Null only for the staff sign-in routes and system work. */
  reason: string | null;
  /** Names of the fields that changed, never their values. */
  changedFields: string[];
}

export const MIN_REASON = 4;
/** U6: a reason is 4 to 500 characters everywhere. */
export const MAX_REASON = 500;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

/**
 * Refuses a reason under 4 or over 500 characters (after trimming) with 422 on `reason` (A14, U6). Call it before any write,
 * so a refused request writes nothing; the audit helper calls it again as a last line.
 */
export function requireReason(reason: unknown): string {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length < MIN_REASON || r.length > MAX_REASON) {
    throw AppError.validation({ reason: `Give a reason of ${MIN_REASON} to ${MAX_REASON} characters.` });
  }
  return r;
}

/** The names of the changed fields, kept in `after` (never their values, Q9). */
function fieldsOf(row: AuditRow): string[] {
  const a = (row.after ?? {}) as { fields?: unknown };
  return Array.isArray(a.fields) ? a.fields.filter((f): f is string => typeof f === "string") : [];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one audit write helper every staff action uses, and the staff read of the log (E-18). */
@Injectable()
export class AuditService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * Writes exactly one audit row inside the caller's transaction, so a rolled-back change leaves no row.
   * Throws 422 (and so rolls the caller back) when the reason is too short or a field name is not a plain name.
   */
  async write(tx: Prisma.TransactionClient, input: AuditInput): Promise<string> {
    const reason = input.reason === null ? null : requireReason(input.reason);
    const bad = input.changedFields.find((f) => !FIELD_NAME.test(f));
    if (bad !== undefined) throw new Error("audit: changedFields holds field names only");
    const id = this.ids.id();
    await tx.auditEntry.create({
      data: {
        id,
        actorType: input.actor.type,
        actorId: input.actor.id,
        action: input.action,
        subjectType: input.target.type,
        subjectId: input.target.id,
        section: input.section,
        reason,
        before: Prisma.DbNull,
        after: { fields: [...input.changedFields] },
        ip: networkOf(input.actor.ip),
        requestId: input.actor.requestId,
      },
    });
    return id;
  }

  /** E-18: newest first, cursor pages, filtered by actor, section (S4), subject type and a first day. */
  async list(q: GetAdminAuditQuery): Promise<Page<AuditEntry>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.AuditEntryWhereInput = {};
    if (q.actorId) where.actorId = q.actorId;
    if (q.subjectType) where.subjectType = q.subjectType;
    if (q.section) where.section = q.section;
    if (q.from) where.createdAt = { gte: new Date(`${q.from}T00:00:00.000Z`) };
    if (q.actorId && !UUID.test(q.actorId)) throw AppError.validation({ actorId: "Must be a staff id." });
    if (q.cursor) {
      const at = decodeCursor(q.cursor).id;
      if (typeof at !== "string" || !UUID.test(at)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.id = { lt: at };
    }
    const rows = await this.db.auditEntry.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const staff = actorIds.length
      ? await this.db.staffAccount.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(staff.map((s) => [s.id, s.name]));
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map((r) => this.toWire(r, names)), nextCursor: page.nextCursor };
  }

  private toWire(r: AuditRow, names: Map<string, string>): AuditEntry {
    const fields = fieldsOf(r);
    const at = toWireInstant(r.createdAt);
    const by = r.actorType === "system" ? "System" : ((r.actorId && names.get(r.actorId)) ?? "Unknown");
    return {
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      by,
      action: r.action,
      what: fields.length ? `${r.action} (${fields.join(", ")})` : r.action,
      section: r.section,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      before: null,
      after: { fields },
      reason: r.reason,
      ip: r.ip,
      requestId: r.requestId,
      href: null,
      from: null,
      at,
      createdAt: at,
    };
  }
}
