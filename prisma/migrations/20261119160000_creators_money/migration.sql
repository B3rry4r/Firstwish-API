-- B16: creators' money. Two tables no Prisma model has, read and written by SQL only from src/modules/royalties and
-- src/modules/payouts (the schema is shared and was not changed).
-- royalty_reversal: the negative row of a refunded payment's royalty. royalty_accrual has a unique (paymentId, creatorId), so a
-- reversal cannot be a second row there; it is one row here per accrual, never a delete of the accrual.
CREATE TABLE "royalty_reversal" (
  "id" UUID NOT NULL,
  "accrualId" UUID NOT NULL,
  "creatorId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "amountKobo" BIGINT NOT NULL,
  "month" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "royalty_reversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "royalty_reversal_negative" CHECK ("amountKobo" < 0),
  CONSTRAINT "royalty_reversal_accrualId_fkey" FOREIGN KEY ("accrualId") REFERENCES "royalty_accrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "royalty_reversal_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "royalty_reversal_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "royalty_reversal_accrualId_key" ON "royalty_reversal"("accrualId");
CREATE INDEX "royalty_reversal_creatorId_id_idx" ON "royalty_reversal"("creatorId", "id");
CREATE INDEX "royalty_reversal_paymentId_idx" ON "royalty_reversal"("paymentId");

-- payout_detail: what the payout table has no column for: when it was handed to the provider and when it was paid, why it
-- failed, the staff note of a manual "paid", and the short lease that keeps two runs from sending one payout at once.
-- Nothing in it is personal data.
CREATE TABLE "payout_detail" (
  "payoutId" UUID NOT NULL,
  "sentAt" TIMESTAMPTZ(3),
  "paidAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "failureReason" TEXT,
  "note" TEXT,
  "sendingUntil" TIMESTAMPTZ(3),
  CONSTRAINT "payout_detail_pkey" PRIMARY KEY ("payoutId"),
  CONSTRAINT "payout_detail_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
