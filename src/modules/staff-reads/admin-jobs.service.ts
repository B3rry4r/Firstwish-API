import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, type Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { Job } from "../../contracts";
import { type AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { JobsService } from "../jobs/jobs.service";
import { UUID } from "./mask";

const STATUSES = ["scheduled", "running", "succeeded", "failed", "dead", "cancelled"];

/** Staff reads of timed jobs and the retry of a parked one (E-61, E-62). */
@Injectable()
export class AdminJobsService {
  constructor(
    private readonly db: PrismaService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
  ) {}

  private wire(j: Prisma.JobGetPayload<object>): Job {
    return { id: j.id, type: j.type.replace(/_/g, "-") as Job["type"], subjectId: j.subjectId, status: j.status, attempts: j.attempts, runAt: toWireInstant(j.runAt), createdAt: toWireInstant(j.createdAt) };
  }

  /** E-61: newest first; `status` and `type` narrow it (a name that is not one is 422). */
  async list(q: { status?: string; type?: string; cursor?: string; limit?: number }): Promise<Page<Job>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.JobWhereInput = {};
    if (q.status) {
      if (!STATUSES.includes(q.status)) throw AppError.validation({ status: `Must be one of ${STATUSES.join(", ")}.` });
      where.status = q.status as "scheduled";
    }
    if (q.type) {
      const type = q.type.trim().replace(/_/g, "-");
      if (!(await this.knownType(type))) throw AppError.validation({ type: "Not a job type." });
      where.type = type.replace(/-/g, "_") as "open_wish";
    }
    if (q.cursor) {
      const id = decodeCursor(q.cursor).id;
      if (!UUID.test(id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.id = { lt: id };
    }
    const rows = await this.db.job.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map((j) => this.wire(j)), nextCursor: page.nextCursor };
  }

  private async knownType(type: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ ok: boolean }[]>`SELECT ${type} = ANY(enum_range(NULL::"JobType")::text[]) AS ok`;
    return rows[0]?.ok === true;
  }

  /**
   * E-62: puts a failed or dead job back to scheduled, now, with its tries counted again: one conditional UPDATE, and the audit row
   * only when that statement changed a row. A job that is scheduled, running or already succeeded is answered as it stands, unchanged.
   */
  async retry(id: string, reasonText: string, actor: AuditActor): Promise<Job> {
    const reason = requireReason(reasonText);
    if (!UUID.test(id)) throw AppError.notFound("No such job.");
    await this.db.$transaction(async (tx) => {
      if (!(await tx.job.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound("No such job.");
      if (await this.jobs.retryParked(id, tx)) {
        await this.audit.write(tx, { actor, section: "/admin", action: "job.retry", target: { type: "Job", id }, reason, changedFields: ["status", "attempts", "runAt"] });
      }
    });
    return this.wire(await this.db.job.findUniqueOrThrow({ where: { id } }));
  }
}
