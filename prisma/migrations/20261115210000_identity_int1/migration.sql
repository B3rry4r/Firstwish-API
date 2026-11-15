-- Identity integration INT-1 (build/rulings-phase3.md S2, S3, U7, V1, V2, V5, V9; registry DEC-146..153).
-- Generated part: prisma migrate diff from schema.prisma (gen_schema.py + .pipeline/schema-map.json).
-- Raw part (after it): the audit backfill of section and reason from the old JSON detail, and the trigger that refuses deleting a
-- staff account (U7). A member B03 stored as removed (suspended, no roles) is not moved to the new status here: a new enum value
-- cannot be used in the transaction that adds it, and no deployed database holds such a row yet.

-- AlterEnum
ALTER TYPE "StaffAccountStatus" ADD VALUE 'removed';

-- AlterTable
ALTER TABLE "audit_entry" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "section" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "auth_code" ADD COLUMN     "canonical" TEXT,
ADD COLUMN     "triedFrom" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "replacedById" UUID;

-- CreateIndex
CREATE INDEX "audit_entry_section_id_idx" ON "audit_entry"("section", "id");

-- CreateIndex
CREATE INDEX "auth_code_canonical_createdAt_idx" ON "auth_code"("canonical", "createdAt");

-- CreateIndex
CREATE INDEX "auth_code_ip_createdAt_idx" ON "auth_code"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "session_familyId_revokedAt_idx" ON "session"("familyId", "revokedAt");

-- Raw: S2 backfill. B03 kept section and reason inside "after"; move them to their columns (the audit table refuses UPDATE, so
-- its update trigger is lifted for this one statement and put back).
ALTER TABLE "audit_entry" DISABLE TRIGGER "audit_entry_no_update";
UPDATE "audit_entry"
SET "section" = COALESCE("after"->>'section', ''),
    "reason" = "after"->>'reason',
    "after" = CASE WHEN "after" ? 'fields' THEN jsonb_build_object('fields', "after"->'fields') ELSE "after" END
WHERE "after" IS NOT NULL AND ("after" ? 'section' OR "after" ? 'reason');
ALTER TABLE "audit_entry" ENABLE TRIGGER "audit_entry_no_update";

-- Raw: U7. A staff account is never deleted (it is an audit actor); a removed member keeps the row with status removed (S3).
CREATE OR REPLACE FUNCTION fw_refuse_staff_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'staff_account rows are never deleted: % refused', TG_OP USING ERRCODE = 'P0001';
END;
$$;
CREATE TRIGGER staff_account_no_delete BEFORE DELETE ON "staff_account" FOR EACH ROW EXECUTE FUNCTION fw_refuse_staff_delete();
CREATE TRIGGER staff_account_no_truncate BEFORE TRUNCATE ON "staff_account" FOR EACH STATEMENT EXECUTE FUNCTION fw_refuse_staff_delete();
