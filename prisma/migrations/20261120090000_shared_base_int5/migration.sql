-- INT-5 shared base (wave 6): the 16 raw-SQL tables of waves 3 to 5 become models (their rows are untouched: the statements below
-- only re-state some foreign keys and add what the rulings ask for), Refund.note (PP3), StudioStyle.version (XX4), a name on a
-- contact-page thread (YY3), ClientWish.wishId (ZB1), the accrual's wish (ZZ5), the paid-by-hand mark on a payout (ZZ8), the given
-- state of a Concierge order (CA2), bounced and complained deliveries (YY3), the job kind of the Studio checks (XX4), and the
-- wish's legacy whole-wish columns leave (VV3). Every step keeps the rows that exist:
--  * the 19 legacy wish columns are dropped only when no row holds anything in them; otherwise the migration stops and names how many rows do.
--  * payout.paidByHandAt is filled from the audit row that marked the payout (action payout.mark-paid), the one place the mark lived.
--  * the accrual's old unique (payment, creator) stays true for the rows with no wish through a partial unique index in SQL.

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "wish" WHERE "blessing" IS NOT NULL OR "call" IS NOT NULL OR "captions" IS NOT NULL
    OR "chapter" IS NOT NULL OR "credits" IS NOT NULL OR "details" IS NOT NULL OR "effect" IS NOT NULL OR "finale" IS NOT NULL
    OR "letter" IS NOT NULL OR "links" IS NOT NULL OR "memory" IS NOT NULL OR "note" IS NOT NULL OR "off" IS NOT NULL
    OR "photos" IS NOT NULL OR "reasons" IS NOT NULL OR "studio" IS NOT NULL OR "timeline" IS NOT NULL OR "type" IS NOT NULL OR "voices" IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'VV3: % wish row(s) hold words in a legacy whole-wish column; move them into content before this migration runs', n;
  END IF;
END $$;

-- AlterEnum
ALTER TYPE "ConciergeOrderStatus" ADD VALUE 'given';

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'check-style-submission';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'bounced';
ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'complained';

-- DropForeignKey
ALTER TABLE "concierge_order_ext" DROP CONSTRAINT "concierge_order_ext_orderId_fkey";

-- DropForeignKey
ALTER TABLE "concierge_order_ext" DROP CONSTRAINT "concierge_order_ext_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "concierge_order_wish" DROP CONSTRAINT "concierge_order_wish_orderId_fkey";

-- DropForeignKey
ALTER TABLE "concierge_order_wish" DROP CONSTRAINT "concierge_order_wish_wishId_fkey";

-- DropIndex
DROP INDEX "royalty_accrual_paymentId_creatorId_key";

-- AlterTable
ALTER TABLE "client_wish" ADD COLUMN     "wishId" UUID;

-- AlterTable
ALTER TABLE "payout" ADD COLUMN     "paidByHandAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "refund" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "royalty_accrual" ADD COLUMN     "wishId" UUID;

-- AlterTable
ALTER TABLE "studio_style" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "support_thread" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "wish" DROP COLUMN "blessing",
DROP COLUMN "call",
DROP COLUMN "captions",
DROP COLUMN "chapter",
DROP COLUMN "credits",
DROP COLUMN "details",
DROP COLUMN "effect",
DROP COLUMN "finale",
DROP COLUMN "letter",
DROP COLUMN "links",
DROP COLUMN "memory",
DROP COLUMN "note",
DROP COLUMN "off",
DROP COLUMN "photos",
DROP COLUMN "reasons",
DROP COLUMN "studio",
DROP COLUMN "timeline",
DROP COLUMN "type",
DROP COLUMN "voices";

-- CreateIndex
CREATE INDEX "client_wish_wishId_id_idx" ON "client_wish"("wishId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "client_wish_wishId_key" ON "client_wish"("wishId");

-- CreateIndex
CREATE INDEX "royalty_accrual_wishId_id_idx" ON "royalty_accrual"("wishId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_accrual_paymentId_creatorId_wishId_key" ON "royalty_accrual"("paymentId", "creatorId", "wishId");

-- AddForeignKey
ALTER TABLE "client_wish" ADD CONSTRAINT "client_wish_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_accrual" ADD CONSTRAINT "royalty_accrual_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order_ext" ADD CONSTRAINT "concierge_order_ext_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "concierge_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order_ext" ADD CONSTRAINT "concierge_order_ext_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order_wish" ADD CONSTRAINT "concierge_order_wish_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "concierge_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order_wish" ADD CONSTRAINT "concierge_order_wish_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ZZ8: the paid-by-hand mark, filled from the audit row that is its only record today (the oldest if there are two)
UPDATE "payout" p SET "paidByHandAt" = a."at"
  FROM (SELECT "subjectId", min("createdAt") AS "at" FROM "audit_entry" WHERE "action" = 'payout.mark-paid' AND "subjectType" = 'Payout' GROUP BY "subjectId") a
 WHERE a."subjectId" = p."id"::text;

-- ZZ5: the accrual is one per payment and creator when it has no wish (a paid wish), and one per wish when it has
CREATE UNIQUE INDEX "royalty_accrual_paymentId_creatorId_nowish_key" ON "royalty_accrual"("paymentId", "creatorId") WHERE "wishId" IS NULL;
