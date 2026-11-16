-- B13: Now Showing and moderation. The tables below are not Prisma models: only src/modules/showing and src/modules/moderation
-- read and write them, by SQL. The two partial unique indexes make "one waiting request" and "one listing per wish" true under a race.
CREATE UNIQUE INDEX "publish_request_one_waiting" ON "publish_request"("wishId") WHERE "status" = 'waiting';
CREATE UNIQUE INDEX "published_wish_one_per_wish" ON "published_wish"("wishId") WHERE "wishId" IS NOT NULL;

-- the staff reason for one decision (a publish request, a report), read back by the owner (decline) and the staff queues
CREATE TABLE "moderation_decision" (
  "subject" TEXT NOT NULL,
  "subjectId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "decidedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "moderation_decision_pkey" PRIMARY KEY ("subject", "subjectId"),
  CONSTRAINT "moderation_decision_subject_known" CHECK ("subject" IN ('publish_request', 'report'))
);

-- the report limit per address, counted in the database: a key (an HMAC of the address, never the address) and the time
CREATE TABLE "report_hit" (
  "id" UUID NOT NULL,
  "bucket" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "report_hit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "report_hit_bucket_key_at_idx" ON "report_hit"("bucket", "key", "at");

-- "This is me, take it down": the code mailed to the address before the report counts. Short lived; the address is removed once used or expired.
CREATE TABLE "take_down_code" (
  "id" UUID NOT NULL,
  "wishId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "tries" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "take_down_code_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "take_down_code_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "take_down_code_wishId_email_idx" ON "take_down_code"("wishId", "email");
