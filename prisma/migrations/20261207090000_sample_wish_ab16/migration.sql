-- API-BASE-16 (IJ1): the designed sample wishes the style previews play, one row per kind and occasion. Reference data seeded by scripts/seed.mjs; never a wish.
CREATE TABLE "sample_wish" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "occasionName" TEXT NOT NULL,
    "call" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "photos" JSONB NOT NULL,

    CONSTRAINT "sample_wish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sample_wish_kind_occasion_key" ON "sample_wish"("kind", "occasion");
