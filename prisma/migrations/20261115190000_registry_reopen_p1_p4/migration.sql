-- Registry reopened for P1 to P4 (build/rulings-phase3.md; DEC-132..135), re-frozen by DEC-136.
-- P1 (DEC-132): numbers_target, the config table PUT /v1/admin/numbers/targets writes.
-- P4 (DEC-135, R11): email is the only channel. auth_code and message_delivery channels narrow to email; a row with
-- sms or whatsapp makes the cast fail and the migration stop (no SMS or WhatsApp adapter ever existed, so none should exist).
-- P2 and P3 change no table.

-- CreateEnum
CREATE TYPE "NoticePrefsChannel" AS ENUM ('email');

-- CreateEnum
CREATE TYPE "NumbersTargetLine" AS ENUM ('tickets', 'extras', 'keeps', 'pass', 'pro_plans', 'vault_space', 'concierge', 'creator_plans');

-- CreateEnum
CREATE TYPE "NumbersTargetPeriod" AS ENUM ('month');

-- AlterEnum
BEGIN;
CREATE TYPE "AuthCodeChannel_new" AS ENUM ('email');
ALTER TABLE "auth_code" ALTER COLUMN "channel" TYPE "AuthCodeChannel_new" USING ("channel"::text::"AuthCodeChannel_new");
ALTER TYPE "AuthCodeChannel" RENAME TO "AuthCodeChannel_old";
ALTER TYPE "AuthCodeChannel_new" RENAME TO "AuthCodeChannel";
DROP TYPE "public"."AuthCodeChannel_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MessageDeliveryChannel_new" AS ENUM ('email');
ALTER TABLE "message_delivery" ALTER COLUMN "channel" TYPE "MessageDeliveryChannel_new" USING ("channel"::text::"MessageDeliveryChannel_new");
ALTER TYPE "MessageDeliveryChannel" RENAME TO "MessageDeliveryChannel_old";
ALTER TYPE "MessageDeliveryChannel_new" RENAME TO "MessageDeliveryChannel";
DROP TYPE "public"."MessageDeliveryChannel_old";
COMMIT;

-- AlterTable (a stored sms or whatsapp choice becomes null: no choice, email is the only channel)
ALTER TABLE "notice_prefs" ALTER COLUMN "channel" TYPE "NoticePrefsChannel"
  USING (CASE WHEN "channel" = 'email' THEN 'email'::"NoticePrefsChannel" ELSE NULL END);

-- CreateTable
CREATE TABLE "numbers_target" (
    "id" UUID NOT NULL,
    "line" "NumbersTargetLine" NOT NULL,
    "period" "NumbersTargetPeriod" NOT NULL,
    "setAt" TIMESTAMPTZ(3) NOT NULL,
    "setBy" TEXT NOT NULL,
    "targetKobo" BIGINT NOT NULL,

    CONSTRAINT "numbers_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "numbers_target_line_period_key" ON "numbers_target"("line", "period");

