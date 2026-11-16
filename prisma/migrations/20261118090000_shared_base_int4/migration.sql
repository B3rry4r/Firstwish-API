-- INT-4 shared base: the tables the wave 3 bundles made by SQL become models (GG1, LL1), one email per key (II3), the account's time
-- zone (II4), the delivery purpose and status values (II5, MM1) and the Pass draws (GG3, GG5). Every step keeps the rows that exist.
--  * message_delivery: a key used twice keeps its oldest row; the others get the row id appended to the key (nothing is deleted).
--  * message_delivery.status: "sent" (a try in flight before this) becomes "sending", "undeliverable" becomes "dropped".
--  * purchase_grant: a reference to an account, business or wish that no longer exists is cleared before its foreign key is added.

-- II3: a key used twice keeps its oldest row
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "idempotencyKey" ORDER BY "createdAt", "id") AS rn
    FROM "message_delivery" WHERE "idempotencyKey" IS NOT NULL
)
UPDATE "message_delivery" m SET "idempotencyKey" = m."idempotencyKey" || '#dup:' || m."id"
  FROM ranked r WHERE r."id" = m."id" AND r.rn > 1;

-- GG1: references that point at nothing are cleared before the foreign keys are added
UPDATE "purchase_grant" SET "accountId" = NULL WHERE "accountId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "account" a WHERE a."id" = "purchase_grant"."accountId");
UPDATE "purchase_grant" SET "businessId" = NULL WHERE "businessId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "business" b WHERE b."id" = "purchase_grant"."businessId");
UPDATE "purchase_grant" SET "wishId" = NULL WHERE "wishId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "wish" w WHERE w."id" = "purchase_grant"."wishId");

-- CreateEnum
CREATE TYPE "PassDrawKind" AS ENUM ('wish', 'upgrade');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageDeliveryPurpose" ADD VALUE 'sealed';
ALTER TYPE "MessageDeliveryPurpose" ADD VALUE 'opens';

-- AlterEnum
BEGIN;
CREATE TYPE "MessageDeliveryStatus_new" AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed', 'dropped');
ALTER TABLE "message_delivery" ALTER COLUMN "status" TYPE "MessageDeliveryStatus_new" USING (
  CASE "status"::text WHEN 'sent' THEN 'sending' WHEN 'undeliverable' THEN 'dropped' ELSE "status"::text END::"MessageDeliveryStatus_new"
);
ALTER TYPE "MessageDeliveryStatus" RENAME TO "MessageDeliveryStatus_old";
ALTER TYPE "MessageDeliveryStatus_new" RENAME TO "MessageDeliveryStatus";
DROP TYPE "public"."MessageDeliveryStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "purchase_grant" DROP CONSTRAINT "purchase_grant_paymentId_fkey";

-- DropIndex
DROP INDEX "purchase_grant_wishId_idx";

-- DropIndex
DROP INDEX "wish_open_wishId_idx";

-- AlterTable
ALTER TABLE "account" ADD COLUMN     "timeZone" TEXT;

-- CreateTable
CREATE TABLE "pass_draw" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "wishId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "kind" "PassDrawKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pass_draw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pass_draw_accountId_id_idx" ON "pass_draw"("accountId", "id");

-- CreateIndex
CREATE INDEX "pass_draw_wishId_id_idx" ON "pass_draw"("wishId", "id");

-- CreateIndex
CREATE INDEX "pass_draw_membershipId_id_idx" ON "pass_draw"("membershipId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pass_draw_wishId_kind_key" ON "pass_draw"("wishId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "message_delivery_idempotencyKey_key" ON "message_delivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "purchase_grant_paymentId_id_idx" ON "purchase_grant"("paymentId", "id");

-- CreateIndex
CREATE INDEX "purchase_grant_accountId_id_idx" ON "purchase_grant"("accountId", "id");

-- CreateIndex
CREATE INDEX "purchase_grant_businessId_id_idx" ON "purchase_grant"("businessId", "id");

-- CreateIndex
CREATE INDEX "purchase_grant_wishId_id_idx" ON "purchase_grant"("wishId", "id");

-- CreateIndex
CREATE INDEX "wish_favourite_wishId_id_idx" ON "wish_favourite"("wishId", "id");

-- CreateIndex
CREATE INDEX "wish_open_wishId_id_idx" ON "wish_open"("wishId", "id");

-- CreateIndex
CREATE INDEX "wish_reaction_wishId_id_idx" ON "wish_reaction"("wishId", "id");

-- AddForeignKey
ALTER TABLE "purchase_grant" ADD CONSTRAINT "purchase_grant_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "purchase_grant" ADD CONSTRAINT "purchase_grant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "purchase_grant" ADD CONSTRAINT "purchase_grant_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "purchase_grant" ADD CONSTRAINT "purchase_grant_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pass_draw" ADD CONSTRAINT "pass_draw_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pass_draw" ADD CONSTRAINT "pass_draw_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_draw" ADD CONSTRAINT "pass_draw_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "pass_membership"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- LL4: the timed job that removes old link hits
ALTER TYPE "JobType" ADD VALUE 'clean-link-hits';

-- II2: who last changed a message's wording, and when
ALTER TABLE "message_template" ADD COLUMN     "editedAt" TIMESTAMPTZ(3),
ADD COLUMN     "editedBy" UUID;
