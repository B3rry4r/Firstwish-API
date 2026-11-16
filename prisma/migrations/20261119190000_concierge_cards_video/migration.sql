-- B19: raw tables for what no Prisma model holds (schema.prisma is not touched).
-- concierge_order_ext: the order's own price (kobo, fixed when it is placed), its payment, and its times.
-- concierge_order_wish: the wishes a maker delivered for an order (a wish is delivered under one order only).
CREATE TABLE "concierge_order_ext" (
  "orderId"     uuid PRIMARY KEY REFERENCES "concierge_order"("id") ON DELETE CASCADE,
  "amountKobo"  bigint NOT NULL CHECK ("amountKobo" >= 0),
  "listKobo"    bigint NOT NULL CHECK ("listKobo" >= 0),
  "paymentId"   uuid UNIQUE REFERENCES "payment"("id"),
  "paidAt"      timestamptz(3),
  "dueAt"       timestamptz(3),
  "givenAt"     timestamptz(3),
  "deliveredAt" timestamptz(3),
  "cancelledAt" timestamptz(3),
  "createdAt"   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE "concierge_order_wish" (
  "orderId"     uuid NOT NULL REFERENCES "concierge_order"("id") ON DELETE CASCADE,
  "wishId"      uuid NOT NULL REFERENCES "wish"("id"),
  "deliveredAt" timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY ("orderId", "wishId"),
  UNIQUE ("wishId")
);
CREATE INDEX "concierge_order_wish_wishId_idx" ON "concierge_order_wish"("wishId");
CREATE INDEX "concierge_order_ext_dueAt_idx" ON "concierge_order_ext"("dueAt");
