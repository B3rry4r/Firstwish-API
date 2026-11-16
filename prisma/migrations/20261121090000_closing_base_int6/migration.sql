-- INT-6 closing base: the voice file of an AI request can be deleted or erased and the link is cleared, not refused (GC2); a client wish
-- records the source of its draw (month or pack, the payment it was counted against, the sku of that line and how many wishes the line
-- gave) so the royalty at the seal reads it instead of working it out then (HD2); a job can be `cancelled` (HC2).
-- Every step keeps the rows that exist: only columns are added and one foreign key's delete rule is widened. The draw's month or pack is
-- copied from the column that already held it (`from`); the payment, sku and size of rows made before this migration stay null and the
-- seal reads such a row the way it did before (it works the source out from the business).

-- CreateEnum
CREATE TYPE "ClientWishDrawFrom" AS ENUM ('month', 'pack');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'cancelled';

-- DropForeignKey
ALTER TABLE "ai_request" DROP CONSTRAINT "ai_request_voiceFileId_fkey";

-- AlterTable
ALTER TABLE "client_wish" ADD COLUMN     "drawFrom" "ClientWishDrawFrom",
ADD COLUMN     "drawPaymentId" UUID,
ADD COLUMN     "drawSku" TEXT,
ADD COLUMN     "drawWishes" INTEGER;

-- CreateIndex
CREATE INDEX "client_wish_drawPaymentId_id_idx" ON "client_wish"("drawPaymentId", "id");

-- AddForeignKey
ALTER TABLE "ai_request" ADD CONSTRAINT "ai_request_voiceFileId_fkey" FOREIGN KEY ("voiceFileId") REFERENCES "stored_file"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "client_wish" ADD CONSTRAINT "client_wish_drawPaymentId_fkey" FOREIGN KEY ("drawPaymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: where the row says where the draw was counted from, the new column says it too.
UPDATE "client_wish" SET "drawFrom" = "from"::"ClientWishDrawFrom" WHERE "from" IN ('month', 'pack') AND "drawFrom" IS NULL;
