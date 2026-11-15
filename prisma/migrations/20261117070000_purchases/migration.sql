-- B07: what each paid line granted, and from which payment. One row per (payment, line): a handler that finds its row already
-- there changes nothing (the second call with the same payment), and a refund reads the row to take the grant back.
-- Not a Prisma model: only src/modules/purchases reads and writes it, by SQL, inside the payment's own transaction.
CREATE TABLE "purchase_grant" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "accountId" UUID,
  "businessId" UUID,
  "wishId" UUID,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3),
  "refusedReason" TEXT,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_grant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_grant_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_grant_paymentId_sku_key" ON "purchase_grant"("paymentId", "sku");
CREATE INDEX "purchase_grant_businessId_kind_idx" ON "purchase_grant"("businessId", "kind");
CREATE INDEX "purchase_grant_wishId_idx" ON "purchase_grant"("wishId");
