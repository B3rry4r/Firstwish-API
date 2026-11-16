-- B18 Vault: what a reveal link holds beyond reveal_link (code, passcode, wrong tries, end, switched off, the chosen files), the
-- plays of a link, the sends that carried an Idempotency-Key, and the most a business's Vault held in a month (the peak).
-- Raw SQL: no Prisma model has these tables yet (schema.prisma is not edited by a bundle; the lead models them at the next shared base).

CREATE TABLE "reveal_access" (
  "linkId" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "shootId" UUID,
  "wishId" UUID,
  "set" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "fileIds" JSONB NOT NULL DEFAULT '[]',
  "passcodeHash" TEXT,
  "tries" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ(3),
  "endsAt" TIMESTAMPTZ(3),
  "offAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "reveal_access_pkey" PRIMARY KEY ("linkId"),
  CONSTRAINT "reveal_access_set_check" CHECK ("set" IN ('proofs', 'finals')),
  CONSTRAINT "reveal_access_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "reveal_link"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reveal_access_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reveal_access_shootId_fkey" FOREIGN KEY ("shootId") REFERENCES "shoot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "reveal_access_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "client_wish"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reveal_access_code_key" ON "reveal_access"("code");
CREATE UNIQUE INDEX "reveal_access_wishId_key" ON "reveal_access"("wishId") WHERE "wishId" IS NOT NULL;
CREATE INDEX "reveal_access_businessId_idx" ON "reveal_access"("businessId");
CREATE INDEX "reveal_access_shootId_idx" ON "reveal_access"("shootId");

CREATE TABLE "reveal_play" (
  "id" UUID NOT NULL,
  "linkId" UUID NOT NULL,
  "visit" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "reveal_play_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reveal_play_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "reveal_link"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reveal_play_linkId_visit_key" ON "reveal_play"("linkId", "visit");

CREATE TABLE "reveal_send" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "wishId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "reveal_send_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reveal_send_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reveal_send_businessId_key_key" ON "reveal_send"("businessId", "key");

CREATE TABLE "vault_peak" (
  "businessId" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "bytes" BIGINT NOT NULL,
  CONSTRAINT "vault_peak_pkey" PRIMARY KEY ("businessId", "month"),
  CONSTRAINT "vault_peak_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
