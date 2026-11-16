-- API-BASE-6 (HS1): the gather link a wish's owner gives friends, and who each friend's voice is from. Additive: two new tables.
CREATE TABLE "wish_gather" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(32) NOT NULL,
    "wishId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_gather_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wish_gather_voice" (
    "id" UUID NOT NULL,
    "wishId" UUID NOT NULL,
    "fromName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_gather_voice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wish_gather_slug_key" ON "wish_gather"("slug");
CREATE UNIQUE INDEX "wish_gather_wishId_key" ON "wish_gather"("wishId");
CREATE INDEX "wish_gather_voice_wishId_id_idx" ON "wish_gather_voice"("wishId", "id");

ALTER TABLE "wish_gather" ADD CONSTRAINT "wish_gather_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wish_gather_voice" ADD CONSTRAINT "wish_gather_voice_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
