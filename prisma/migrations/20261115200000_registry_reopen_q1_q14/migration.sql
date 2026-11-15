-- Registry reopened a second time (build/rulings-phase3.md Q1 to Q14; DEC-137..145).
-- Generated part: prisma migrate diff from schema.prisma (gen_schema.py + .pipeline/schema-map.json), with four hand changes (indexes that survive an in-place uuid change are IF NOT EXISTS):
-- text id columns turn into uuid in place (USING ::uuid, no drop), calendar dates keep their UTC day, and a creator handle moves
-- to its account before creator.handle is dropped (Q7). pass_membership.paymentId is NOT NULL: no route has written a Pass yet.
-- Raw part (after the generated part): CHECK constraints, lower() unique indexes and triggers Prisma cannot express.

-- CreateEnum
CREATE TYPE "AccountMode" AS ENUM ('light', 'dark', 'system');

-- CreateEnum
CREATE TYPE "PassMembershipState" AS ENUM ('active', 'expired', 'refunded');

-- AlterEnum
BEGIN;
CREATE TYPE "AuthCodePurpose_new" AS ENUM ('sign-in', 'confirm-email', 'staff-sign-in');
ALTER TABLE "auth_code" ALTER COLUMN "purpose" TYPE "AuthCodePurpose_new" USING ("purpose"::text::"AuthCodePurpose_new");
ALTER TYPE "AuthCodePurpose" RENAME TO "AuthCodePurpose_old";
ALTER TYPE "AuthCodePurpose_new" RENAME TO "AuthCodePurpose";
DROP TYPE "public"."AuthCodePurpose_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "AuthCodeVia_new" AS ENUM ('email');
ALTER TABLE "auth_code" ALTER COLUMN "via" TYPE "AuthCodeVia_new" USING ("via"::text::"AuthCodeVia_new");
ALTER TYPE "AuthCodeVia" RENAME TO "AuthCodeVia_old";
ALTER TYPE "AuthCodeVia_new" RENAME TO "AuthCodeVia";
DROP TYPE "public"."AuthCodeVia_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_payoutId_fkey";

-- DropForeignKey
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_refundId_fkey";

-- DropIndex
DROP INDEX "creator_handle_key";

-- AlterTable
ALTER TABLE "account" ADD COLUMN     "erasedAt" TIMESTAMPTZ(3),
ADD COLUMN     "mode" "AccountMode" NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "audit_entry" ALTER COLUMN "actorId" SET DATA TYPE UUID USING "actorId"::uuid;

-- AlterTable
ALTER TABLE "business" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "client_wish" ALTER COLUMN "day" SET DATA TYPE DATE USING ("day" AT TIME ZONE 'UTC')::date;

-- AlterTable
ALTER TABLE "concierge_order" ALTER COLUMN "makerId" SET DATA TYPE UUID USING "makerId"::uuid;

-- Q7: one handle namespace. A creator handle moves to its account when the account has none, then the column goes.
UPDATE "account" a SET "handle" = lower(c."handle") FROM "creator" c WHERE c."accountId" = a."id" AND a."handle" IS NULL AND c."handle" IS NOT NULL;

-- AlterTable
ALTER TABLE "creator" DROP COLUMN "handle",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "creator_state" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "date_row" ALTER COLUMN "date" SET DATA TYPE DATE USING ("date" AT TIME ZONE 'UTC')::date;

-- AlterTable
ALTER TABLE "day_pick" ALTER COLUMN "date" SET DATA TYPE DATE USING ("date" AT TIME ZONE 'UTC')::date;

-- AlterTable
ALTER TABLE "message_template" ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "notice" ALTER COLUMN "deliveryId" SET DATA TYPE UUID USING "deliveryId"::uuid;

-- AlterTable
ALTER TABLE "numbers_target" ALTER COLUMN "setBy" SET DATA TYPE UUID USING "setBy"::uuid,
ALTER COLUMN "setBy" SET NOT NULL;

-- AlterTable
ALTER TABLE "pass_membership" ADD COLUMN     "paymentId" UUID NOT NULL,
ADD COLUMN     "state" "PassMembershipState" NOT NULL DEFAULT 'active',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "fulfilledAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "person" ALTER COLUMN "birthday" SET DATA TYPE DATE USING ("birthday" AT TIME ZONE 'UTC')::date,
ALTER COLUMN "start" SET DATA TYPE DATE USING ("start" AT TIME ZONE 'UTC')::date;

-- AlterTable
ALTER TABLE "price" DROP COLUMN "value";

-- AlterTable
ALTER TABLE "refund" ALTER COLUMN "requestedBy" SET DATA TYPE UUID USING "requestedBy"::uuid,
ALTER COLUMN "requestedBy" SET NOT NULL,
ALTER COLUMN "approvedBy" SET DATA TYPE UUID USING "approvedBy"::uuid;

-- AlterTable
ALTER TABLE "report" ALTER COLUMN "decidedBy" SET DATA TYPE UUID USING "decidedBy"::uuid;

-- AlterTable
ALTER TABLE "session" ALTER COLUMN "staffId" SET DATA TYPE UUID USING "staffId"::uuid;

-- AlterTable
ALTER TABLE "shoot" ALTER COLUMN "date" SET DATA TYPE DATE USING ("date" AT TIME ZONE 'UTC')::date;

-- AlterTable
ALTER TABLE "stored_file" ALTER COLUMN "ownerAccountId" SET DATA TYPE UUID USING "ownerAccountId"::uuid;

-- AlterTable
ALTER TABLE "support_message" ALTER COLUMN "threadId" SET DATA TYPE UUID USING "threadId"::uuid,
ALTER COLUMN "threadId" SET NOT NULL;

-- AlterTable
ALTER TABLE "support_thread" ALTER COLUMN "assigneeId" SET DATA TYPE UUID USING "assigneeId"::uuid;

-- AlterTable
ALTER TABLE "wish" ADD COLUMN     "passcodeHash" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "wish_link" ADD COLUMN     "lockedUntil" TIMESTAMPTZ(3),
ADD COLUMN     "tries" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "slug" SET DATA TYPE VARCHAR(32);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_entry_actorId_id_idx" ON "audit_entry"("actorId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "concierge_order_makerId_id_idx" ON "concierge_order"("makerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_state_accountId_key" ON "creator_state"("accountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notice_deliveryId_id_idx" ON "notice"("deliveryId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "numbers_target_setBy_id_idx" ON "numbers_target"("setBy", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pass_membership_paymentId_id_idx" ON "pass_membership"("paymentId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pass_membership_paymentId_key" ON "pass_membership"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_creatorId_month_key" ON "payout"("creatorId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payout_providerReference_key" ON "payout"("providerReference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "refund_requestedBy_id_idx" ON "refund"("requestedBy", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "refund_approvedBy_id_idx" ON "refund"("approvedBy", "id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_providerReference_key" ON "refund"("providerReference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "report_decidedBy_id_idx" ON "report"("decidedBy", "id");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_accrual_paymentId_creatorId_key" ON "royalty_accrual"("paymentId", "creatorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_staffId_id_idx" ON "session"("staffId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stored_file_ownerAccountId_id_idx" ON "stored_file"("ownerAccountId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "support_message_threadId_id_idx" ON "support_message"("threadId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "support_thread_assigneeId_id_idx" ON "support_thread"("assigneeId", "id");

-- AddForeignKey
ALTER TABLE "audit_entry" ADD CONSTRAINT "audit_entry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_account"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concierge_order" ADD CONSTRAINT "concierge_order_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "staff_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payout"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refund"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "message_delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numbers_target" ADD CONSTRAINT "numbers_target_setBy_fkey" FOREIGN KEY ("setBy") REFERENCES "staff_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_membership" ADD CONSTRAINT "pass_membership_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "staff_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "staff_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "staff_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "support_thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_thread" ADD CONSTRAINT "support_thread_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ raw SQL

-- Q5: every kobo amount is 0 or more (reconciliation.differenceKobo is signed by nature and is left out); a refund moves a
-- positive amount (Q6). Credits, reviews, wishes used, bytes used, tries and versions are 0 or more.
ALTER TABLE "concierge_order" ADD CONSTRAINT "concierge_order_quoteKobo_nonneg" CHECK ("quoteKobo" >= 0);
ALTER TABLE "creator" ADD CONSTRAINT "creator_earned_nonneg" CHECK ("earned" >= 0);
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_keepsakeExtrasCeilingKobo_nonneg" CHECK ("keepsakeExtrasCeilingKobo" >= 0);
ALTER TABLE "event" ADD CONSTRAINT "event_amountKobo_nonneg" CHECK ("amountKobo" >= 0);
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_amount_nonneg" CHECK ("amount" >= 0);
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_vat_nonneg" CHECK ("vat" >= 0);
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_amountKobo_nonneg" CHECK ("amountKobo" >= 0);
ALTER TABLE "lifecycle_config" ADD CONSTRAINT "lifecycle_config_keepsakeExtrasCeiling_nonneg" CHECK ("keepsakeExtrasCeiling" >= 0);
ALTER TABLE "message_delivery" ADD CONSTRAINT "message_delivery_costKobo_nonneg" CHECK ("costKobo" >= 0);
ALTER TABLE "numbers_target" ADD CONSTRAINT "numbers_target_targetKobo_nonneg" CHECK ("targetKobo" >= 0);
ALTER TABLE "pass_membership" ADD CONSTRAINT "pass_membership_amount_nonneg" CHECK ("amount" >= 0);
ALTER TABLE "payment" ADD CONSTRAINT "payment_amountKobo_nonneg" CHECK ("amountKobo" >= 0);
ALTER TABLE "payment" ADD CONSTRAINT "payment_feeKobo_nonneg" CHECK ("feeKobo" >= 0);
ALTER TABLE "payout" ADD CONSTRAINT "payout_amountKobo_nonneg" CHECK ("amountKobo" >= 0);
ALTER TABLE "price" ADD CONSTRAINT "price_listKobo_nonneg" CHECK ("listKobo" >= 0);
ALTER TABLE "price" ADD CONSTRAINT "price_promoKobo_nonneg" CHECK ("promoKobo" >= 0);
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_providerTotalKobo_nonneg" CHECK ("providerTotalKobo" >= 0);
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_ledgerTotalKobo_nonneg" CHECK ("ledgerTotalKobo" >= 0);
ALTER TABLE "royalty_accrual" ADD CONSTRAINT "royalty_accrual_amountKobo_nonneg" CHECK ("amountKobo" >= 0);
ALTER TABLE "business" ADD CONSTRAINT "business_invoices_nonneg" CHECK ("invoices" >= 0);
ALTER TABLE "refund" ADD CONSTRAINT "refund_amountKobo_positive" CHECK ("amountKobo" > 0);
ALTER TABLE "creator" ADD CONSTRAINT "creator_credits_nonneg" CHECK ("credits" >= 0);
ALTER TABLE "creator_state" ADD CONSTRAINT "creator_state_credits_nonneg" CHECK ("credits" >= 0);
ALTER TABLE "creator_state" ADD CONSTRAINT "creator_state_reviewsLeft_nonneg" CHECK ("reviewsLeft" >= 0);
ALTER TABLE "creator_state" ADD CONSTRAINT "creator_state_extraReviews_nonneg" CHECK ("extraReviews" >= 0);
ALTER TABLE "creator_state" ADD CONSTRAINT "creator_state_packs_nonneg" CHECK ("packs" >= 0);
ALTER TABLE "pass_membership" ADD CONSTRAINT "pass_membership_wishesUsed_nonneg" CHECK ("wishesUsed" >= 0);
ALTER TABLE "pass_membership" ADD CONSTRAINT "pass_membership_upgradesUsed_nonneg" CHECK ("upgradesUsed" >= 0);
ALTER TABLE "business" ADD CONSTRAINT "business_used_nonneg" CHECK ("used" >= 0);
ALTER TABLE "business" ADD CONSTRAINT "business_allowance_nonneg" CHECK ("allowance" >= 0);
ALTER TABLE "business" ADD CONSTRAINT "business_rolled_nonneg" CHECK ("rolled" >= 0);
ALTER TABLE "business" ADD CONSTRAINT "business_vault_nonneg" CHECK ("vault" >= 0);
ALTER TABLE "business" ADD CONSTRAINT "business_vaultUsedGb_nonneg" CHECK ("vaultUsedGb" >= 0);
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_bytes_nonneg" CHECK ("bytes" >= 0);
ALTER TABLE "upload_ticket" ADD CONSTRAINT "upload_ticket_bytes_nonneg" CHECK ("bytes" >= 0);
ALTER TABLE "wish_link" ADD CONSTRAINT "wish_link_tries_nonneg" CHECK ("tries" >= 0);
ALTER TABLE "business" ADD CONSTRAINT "business_version_nonneg" CHECK ("version" >= 0);
ALTER TABLE "creator" ADD CONSTRAINT "creator_version_nonneg" CHECK ("version" >= 0);
ALTER TABLE "creator_state" ADD CONSTRAINT "creator_state_version_nonneg" CHECK ("version" >= 0);
ALTER TABLE "pass_membership" ADD CONSTRAINT "pass_membership_version_nonneg" CHECK ("version" >= 0);
ALTER TABLE "wish" ADD CONSTRAINT "wish_version_nonneg" CHECK ("version" >= 0);

-- Q5: payment.fulfilledAt is set once; a second fulfilment cannot move or clear it.
CREATE OR REPLACE FUNCTION fw_fulfilled_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."fulfilledAt" IS NOT NULL AND NEW."fulfilledAt" IS DISTINCT FROM OLD."fulfilledAt" THEN
    RAISE EXCEPTION 'payment.fulfilledAt is set once: change refused' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_fulfilled_once BEFORE UPDATE OF "fulfilledAt" ON "payment" FOR EACH ROW EXECUTE FUNCTION fw_fulfilled_once();

-- Q7: email and handle are unique without regard to case: stored lowercased (CHECK) and unique on lower(...).
-- The handle follows the canon in src/common/normalise/handle.ts (3 to 20 of a-z 0-9 . _, no leading @).
ALTER TABLE "account" ADD CONSTRAINT "account_contact_lower" CHECK ("contact" = lower(btrim("contact")));
ALTER TABLE "account" ADD CONSTRAINT "account_handle_canon" CHECK ("handle" ~ '^[a-z0-9._]{3,20}$');
CREATE UNIQUE INDEX "account_contact_lower_key" ON "account" (lower("contact"));
CREATE UNIQUE INDEX "account_handle_lower_key" ON "account" (lower("handle"));
ALTER TABLE "staff_account" ADD CONSTRAINT "staff_account_email_lower" CHECK ("email" = lower(btrim("email")));
CREATE UNIQUE INDEX "staff_account_email_lower_key" ON "staff_account" (lower("email"));

-- Q8: the passcode (and a question opening's answer) is never in the content JSON: Wish.passcodeHash holds its hash.
-- The link slug is issued by the server: 8 to 32 of A-Z a-z 0-9 _ - (Default (lead), owner may override: no 4-character slugs).
ALTER TABLE "wish" ADD CONSTRAINT "wish_content_no_secret" CHECK (NOT coalesce(("content" #> '{opening,values}') ?| array['code', 'answer', 'passcode'], false));
ALTER TABLE "wish_link" ADD CONSTRAINT "wish_link_slug_issued" CHECK ("slug" ~ '^[A-Za-z0-9_-]{8,32}$');

-- Q9: audit rows hold ids and the names of changed fields, never personal values, so they never need blanking: the audit
-- log is append-only (UPDATE was refused already; DELETE and TRUNCATE are refused now).
CREATE TRIGGER audit_entry_no_delete BEFORE DELETE ON "audit_entry" FOR EACH ROW EXECUTE FUNCTION fw_refuse_change();
CREATE TRIGGER audit_entry_no_truncate BEFORE TRUNCATE ON "audit_entry" FOR EACH STATEMENT EXECUTE FUNCTION fw_refuse_change();
