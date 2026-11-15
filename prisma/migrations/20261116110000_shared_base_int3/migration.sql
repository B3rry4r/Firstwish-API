-- INT-3 shared base: BB1 (approved_date.businessId, a real foreign key), CC3 (lifecycle_config.wishContentMaxBytes), CC4 (one job row per
-- type and subject key), DD3 (payment.flags, webhook_event.outcome), EE1 (job_kind_config: a time limit per kind of job), EE7 (a wish's
-- openedAt is set once). Rows that exist keep their values: the column is added empty, filled, then made required.

-- BB1: every approval belongs to the business of the person its key names (`personId:b|s:year`); a row no person owns is dropped
-- (nothing wrote this table before this wave), and a second row with the same key in one business is dropped.
ALTER TABLE "approved_date" ADD COLUMN "businessId" UUID;
UPDATE "approved_date" a SET "businessId" = p."businessId" FROM "person" p
 WHERE a."key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:' AND p."id"::text = split_part(a."key", ':', 1);
DELETE FROM "approved_date" WHERE "businessId" IS NULL;
DELETE FROM "approved_date" a USING "approved_date" b WHERE a."businessId" = b."businessId" AND a."key" = b."key" AND a."id" > b."id";
ALTER TABLE "approved_date" ALTER COLUMN "businessId" SET NOT NULL;

-- CC4: one row per (type, subject key). Duplicates are merged first: the row still waiting (else the newest) stays, and the runs of
-- the others are moved onto it, so no recorded run is lost.
CREATE TEMP TABLE "_job_keep" AS
  SELECT "id", first_value("id") OVER (PARTITION BY "type", "subjectId"
           ORDER BY ("status" IN ('scheduled', 'failed', 'running')) DESC, "id" DESC) AS "keep"
    FROM "job";
UPDATE "job_run" r SET "jobId" = k."keep" FROM "_job_keep" k WHERE r."jobId" = k."id" AND k."id" <> k."keep";
DELETE FROM "job" j USING "_job_keep" k WHERE j."id" = k."id" AND k."id" <> k."keep";
DROP TABLE "_job_keep";

-- AlterTable
ALTER TABLE "lifecycle_config" ADD COLUMN     "wishContentMaxBytes" INTEGER NOT NULL DEFAULT 262144;

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "webhook_event" ADD COLUMN     "outcome" TEXT;

-- CreateTable
CREATE TABLE "job_kind_config" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "timeLimitSeconds" INTEGER NOT NULL,

    CONSTRAINT "job_kind_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_kind_config_kind_key" ON "job_kind_config"("kind");

-- CreateIndex
CREATE INDEX "approved_date_businessId_id_idx" ON "approved_date"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "approved_date_businessId_key_key" ON "approved_date"("businessId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "job_type_subjectId_key" ON "job"("type", "subjectId");

-- AddForeignKey
ALTER TABLE "approved_date" ADD CONSTRAINT "approved_date_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EE7: a wish is opened once. openedAt, once set, cannot move or clear, so two first reads at one moment keep the first.
CREATE OR REPLACE FUNCTION fw_opened_once() RETURNS trigger AS $$
BEGIN
  IF OLD."openedAt" IS NOT NULL AND NEW."openedAt" IS DISTINCT FROM OLD."openedAt" THEN
    RAISE EXCEPTION 'wish.openedAt is set once: change refused' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER wish_opened_once BEFORE UPDATE OF "openedAt" ON "wish" FOR EACH ROW EXECUTE FUNCTION fw_opened_once();
