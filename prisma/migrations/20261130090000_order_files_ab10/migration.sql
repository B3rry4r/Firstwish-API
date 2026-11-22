-- API-BASE-10 (IC7): the files a Concierge buyer gives with an order. One row per file (a photo or a voice note), tied to the order until it is delivered or cancelled.
CREATE TABLE "concierge_order_file" (
    "fileId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concierge_order_file_pkey" PRIMARY KEY ("fileId")
);

-- CreateIndex
CREATE INDEX "concierge_order_file_orderId_fileId_idx" ON "concierge_order_file"("orderId", "fileId");

-- AddForeignKey
ALTER TABLE "concierge_order_file" ADD CONSTRAINT "concierge_order_file_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concierge_order_file" ADD CONSTRAINT "concierge_order_file_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "concierge_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
