-- B17: the invoice number counter (one row, taken with a row lock inside the settle transaction, so numbers run in order with no gaps)
-- and what ties an invoice to the payment it came from, its period and whether a refund voided it. Not Prisma models: only
-- src/modules/pro-business reads and writes them, by SQL (the way purchase_grant is kept).
CREATE TABLE "invoice_counter" (
  "id" INTEGER NOT NULL,
  "last" INTEGER NOT NULL,
  CONSTRAINT "invoice_counter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_counter_one_row" CHECK ("id" = 1)
);
INSERT INTO "invoice_counter" ("id", "last") VALUES (1, 0);

CREATE TABLE "invoice_link" (
  "invoiceId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "periodStart" TIMESTAMPTZ(3),
  "periodEnd" TIMESTAMPTZ(3),
  "voidedAt" TIMESTAMPTZ(3),
  CONSTRAINT "invoice_link_pkey" PRIMARY KEY ("invoiceId"),
  CONSTRAINT "invoice_link_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_link_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invoice_link_paymentId_key" ON "invoice_link"("paymentId");
