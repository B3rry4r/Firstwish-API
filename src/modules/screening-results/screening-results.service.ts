import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { StoragePort } from "../../common/ports/storage.port";
import type { ScreeningResult } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { isUuid, variantsOf } from "../stored-files/file-rules";
import { screeningView } from "../stored-files/screening.service";

/** ScreeningResult: the staff queue of held files and the moderator's decision (E-157). */
@Injectable()
export class ScreeningResultsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StoragePort,
  ) {}

  /** The staff queue: held files (verdict review) not yet decided, oldest first. */
  async queue(limit = 50): Promise<ScreeningResult[]> {
    const rows = await this.db.screeningResult.findMany({ where: { verdict: "review", finalVerdict: null }, orderBy: { id: "asc" }, take: limit });
    return rows.map(screeningView);
  }

  /**
   * E-157: pass makes the held file usable; reject refuses it for good (the object is removed, Vault bytes given back).
   * One audit row with the reason, in the same transaction. A result already decided, or not held, is 409.
   */
  async decide(id: string, body: { finalVerdict: unknown; reason: unknown }, actor: AuditActor): Promise<ScreeningResult> {
    const fv = body.finalVerdict;
    if (fv !== "pass" && fv !== "reject") throw AppError.validation({ finalVerdict: "Must be pass or reject." });
    const reason = requireReason(body.reason);
    if (!isUuid(id)) throw AppError.notFound("No such screening result.");
    const out = await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM screening_result WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw AppError.notFound("No such screening result.");
      const r = await tx.screeningResult.findUniqueOrThrow({ where: { id } });
      if (r.verdict !== "review" || r.finalVerdict !== null) throw AppError.conflict("already_decided", "This file is not waiting for a decision.");
      const fileRows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stored_file WHERE id = ${r.fileId}::uuid FOR UPDATE`;
      const file = fileRows.length ? await tx.storedFile.findUniqueOrThrow({ where: { id: r.fileId } }) : null;
      const keys: string[] = [];
      if (file && file.status === "screening") {
        if (fv === "pass") {
          await tx.storedFile.update({ where: { id: file.id }, data: { status: "ready" } });
        } else {
          await tx.storedFile.update({ where: { id: file.id }, data: { status: "rejected" } });
          if (file.businessId && file.purpose === "vault_file") {
            await tx.$executeRaw`UPDATE business SET vault = GREATEST(COALESCE(vault, 0) - ${file.bytes}, 0), version = version + 1 WHERE id = ${file.businessId}::uuid`;
          }
          keys.push(file.objectKey, ...variantsOf(file).map((v) => v.key));
        }
      }
      const updated = await tx.screeningResult.update({ where: { id }, data: { finalVerdict: fv, reviewedBy: actor.id } });
      await this.audit.write(tx, {
        actor,
        section: "/admin/moderation",
        action: "screening.decide",
        target: { type: "ScreeningResult", id },
        reason,
        changedFields: ["finalVerdict", "reviewedBy"],
      });
      return { updated, keys };
    });
    for (const k of out.keys) await this.storage.delete(k);
    return screeningView(out.updated);
  }
}
