-- B20 Support. Two tables no Prisma model has (raw SQL, by hand) and one index on message_delivery.
-- Neither new table holds a readable address or network: keys are keyed hashes (HMAC), so an erase has nothing to blank.

-- Contact-page and inbound-mail intake: one row per (kind, key, UTC day). A thread is let in by ONE statement that raises the
-- count only while it is under the limit, so two requests at once cannot both pass the last place.
CREATE TABLE "support_intake_count" (
  "kind"  TEXT NOT NULL,
  "key"   TEXT NOT NULL,
  "day"   DATE NOT NULL,
  "count" INTEGER NOT NULL,
  CONSTRAINT "support_intake_count_pkey" PRIMARY KEY ("kind", "key", "day"),
  CONSTRAINT "support_intake_count_kind_check" CHECK ("kind" IN ('network', 'email')),
  CONSTRAINT "support_intake_count_count_check" CHECK ("count" >= 0)
);
CREATE INDEX "support_intake_count_day_idx" ON "support_intake_count" ("day");

-- An address that complained: no more email goes to it. Keyed by the address's keyed hash.
CREATE TABLE "email_suppression" (
  "hash"      TEXT NOT NULL,
  "reason"    TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "email_suppression_pkey" PRIMARY KEY ("hash"),
  CONSTRAINT "email_suppression_reason_check" CHECK ("reason" IN ('complained'))
);

-- Delivery news names the provider's message id; look it up by index. (schema.prisma needs @@index([providerMessageId]) to match: see the hand-back.)
CREATE INDEX "message_delivery_providerMessageId_idx" ON "message_delivery" ("providerMessageId");
