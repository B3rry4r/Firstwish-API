import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

/**
 * Erase (T-62, rulings AA1): the account's Studio drafts and settings go. A style that went live stays in the catalogue and keeps
 * working in wishes already made, with its snapshot. A style that waits for review is taken out of the queue. Column by column:
 *   StudioPrefs.document: deleted (the row goes). StudioStyle.document: deleted with the draft, kept with a live style (its
 *   creator's work, licensed to Firstwish). StudioStyle.status: kept. StyleSubmission.checks, reviewedBy, note: kept (not personal).
 *   style_submission_snapshot.document: deleted for a submission that never went live, kept for one that did.
 *   CreatorState (credits, plan): kept, ids and counters only. AiRequest: blanked by the account erase itself.
 * Called by the account erase inside its transaction, with the account already locked.
 */
@Injectable()
export class StudioErasure {
  async forget(tx: Prisma.TransactionClient, accountId: string): Promise<void> {
    await tx.studioPrefs.deleteMany({ where: { accountId } });
    const drafts = await tx.studioStyle.findMany({ where: { accountId, status: { not: "live" } }, select: { id: true } });
    const ids = drafts.map((d) => d.id);
    if (ids.length) {
      const waiting = await tx.styleSubmission.findMany({ where: { styleId: { in: ids }, status: "review" }, select: { id: true } });
      const waitingIds = waiting.map((w) => w.id);
      if (waitingIds.length) {
        await tx.$executeRaw`DELETE FROM job WHERE type = 'style-level-review'::"JobType" AND "subjectId" = ANY(${waitingIds.map((w) => `check:${w}`)}::text[]) AND status = 'scheduled'`;
        await tx.styleSubmission.updateMany({ where: { id: { in: waitingIds } }, data: { status: "returned", decision: "return", note: "The creator erased their account." } });
      }
      await tx.$executeRaw`
        DELETE FROM style_submission_snapshot s USING style_submission u
         WHERE s."submissionId" = u.id AND u.status <> 'live' AND u."styleId" = ANY(${ids}::uuid[])`;
      await tx.studioStyle.deleteMany({ where: { id: { in: ids } } });
    }
  }
}
