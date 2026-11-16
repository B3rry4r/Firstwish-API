import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

/**
 * Erase (T-62, rulings AA1, SA4): the account's Studio drafts and settings go. A style that went live stays in the catalogue and keeps
 * working in wishes already made, with no person on it: the design stays; the byline, the brief the creator typed, the words of the
 * rights line and Style.by go (and the catalogue's own line, which was the brief), and so does the creator's name in the style's record. A style that waits for review is taken out of the queue. Column by column:
 *   StudioPrefs.document: deleted (the row goes). StudioStyle.document: deleted with the draft; with a live style
 *   the design is kept (licensed to Firstwish) and `byline`, `brief` and `rights.words` are removed. StudioStyle.status: kept. StyleSubmission.checks, reviewedBy, note: kept (not personal).
 *   style_submission_snapshot.document: deleted for a submission that never went live; kept for one that did, as the design only
 *   (the same three keys removed). Style.by, Style.line and Style.feel: emptied, the line and feel set to the style's name.
 *   Style.record entries the creator made ("Sent in for review", "Withdrawn by its creator"): `by` emptied.
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
    // SA4: what remains of the account's live styles carries no person.
    const live = await tx.studioStyle.findMany({ where: { accountId, status: "live" }, select: { id: true } });
    const liveIds = live.map((l) => l.id);
    await tx.$executeRaw`
      UPDATE studio_style SET document = (document - 'byline' - 'brief')
        || CASE WHEN jsonb_typeof(document->'rights') = 'object' THEN jsonb_build_object('rights', (document->'rights') - 'words') ELSE '{}'::jsonb END
       WHERE "accountId" = ${accountId}::uuid`;
    await tx.$executeRaw`
      UPDATE style_submission_snapshot SET document = (document - 'byline' - 'brief')
        || CASE WHEN jsonb_typeof(document->'rights') = 'object' THEN jsonb_build_object('rights', (document->'rights') - 'words') ELSE '{}'::jsonb END
       WHERE "accountId" = ${accountId}::uuid`;
    if (liveIds.length) {
      await tx.$executeRaw`
        UPDATE style SET "by" = '', line = name, feel = name,
               record = COALESCE((SELECT jsonb_agg(CASE WHEN e->>'what' IN ('Sent in for review', 'Withdrawn by its creator') THEN jsonb_set(e, '{by}', '""'::jsonb) ELSE e END ORDER BY n)
                                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(record) = 'array' THEN record ELSE '[]'::jsonb END) WITH ORDINALITY AS r(e, n)), '[]'::jsonb)
         WHERE id = ANY(${liveIds}::uuid[])`;
    }
  }
}
