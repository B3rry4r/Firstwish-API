-- API-BASE-3 (HM3, DEC-214): one new table, wish_start: the Idempotency-Key a wish was started with and the draft it answered. Additive.
-- CreateTable
CREATE TABLE "wish_start" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "wishId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_start_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wish_start_accountId_id_idx" ON "wish_start"("accountId", "id");

-- CreateIndex
CREATE INDEX "wish_start_wishId_id_idx" ON "wish_start"("wishId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wish_start_accountId_key_key" ON "wish_start"("accountId", "key");

-- AddForeignKey
ALTER TABLE "wish_start" ADD CONSTRAINT "wish_start_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "wish_start" ADD CONSTRAINT "wish_start_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

