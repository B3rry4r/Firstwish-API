-- B15 Studio. Raw SQL on purpose: style_submission_snapshot has no Prisma model (the registry holds a submission's frozen
-- draft nowhere: StyleSubmission has no column for it), and the two other statements are an index and data in an existing row.
--
-- 1. The frozen draft of each submission (T-63: the checks and the reviewer read the snapshot, never the live draft).
--    Erase rules, column by column (the schema-map has no row for this table, so they are written here and kept by
--    StudioErasure): document = the creator's own style work, deleted with a submission that never went live and kept for one
--    that did (T-62: a live style keeps working); used = which review was spent, not personal, kept; accountId and
--    submissionId = ids, kept; createdAt = a time, kept.
CREATE TABLE "style_submission_snapshot" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "used" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "style_submission_snapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "style_submission_snapshot_used_check" CHECK ("used" IN ('plan', 'extra')),
    CONSTRAINT "style_submission_snapshot_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "style_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "style_submission_snapshot_submissionId_key" ON "style_submission_snapshot"("submissionId");
CREATE INDEX "style_submission_snapshot_accountId_idx" ON "style_submission_snapshot"("accountId");

-- 2. One submission of a style waits at a time: a second submit while one waits is a unique violation the service answers as 409.
CREATE UNIQUE INDEX "style_submission_one_waiting" ON "style_submission"("styleId") WHERE "status" = 'review';

-- 3. T-21: how many drafts a plan allows is in the entitlements row, not in code. Added where the row has no value yet.
UPDATE "entitlements"
   SET "creator" = jsonb_set("creator", '{open,drafts}', '1'::jsonb, true)
 WHERE jsonb_typeof("creator" -> 'open') = 'object' AND NOT ("creator" -> 'open' ? 'drafts');
UPDATE "entitlements"
   SET "creator" = jsonb_set("creator", '{creator,drafts}', '"unlimited"'::jsonb, true)
 WHERE jsonb_typeof("creator" -> 'creator') = 'object' AND NOT ("creator" -> 'creator' ? 'drafts');
