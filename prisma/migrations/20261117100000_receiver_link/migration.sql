-- B10: the receiver's link. wish_open gets the wish, the kind of row, whether it was the first opening and the opening session
-- (a hash, never an address); the three tables below are not Prisma models: only src/modules/public-wishes reads and writes them, by SQL.
ALTER TABLE "wish_open"
  ADD COLUMN "wishId" UUID,
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'read',
  ADD COLUMN "first" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "session" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now();
ALTER TABLE "wish_open" ADD CONSTRAINT "wish_open_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wish_open" ADD CONSTRAINT "wish_open_kind_known" CHECK ("kind" IN ('read', 'play'));
CREATE INDEX "wish_open_wishId_idx" ON "wish_open"("wishId");
-- one first opening per wish, whatever the number of reads at once
CREATE UNIQUE INDEX "wish_open_one_first" ON "wish_open"("wishId") WHERE "first";

-- one reaction per opening session, changeable
CREATE TABLE "wish_reaction" (
  "id" UUID NOT NULL,
  "wishId" UUID NOT NULL,
  "session" TEXT NOT NULL,
  "reaction" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "wish_reaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wish_reaction_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "wish_reaction_wishId_session_key" ON "wish_reaction"("wishId", "session");

-- the photo positions an opening session marked
CREATE TABLE "wish_favourite" (
  "id" UUID NOT NULL,
  "wishId" UUID NOT NULL,
  "session" TEXT NOT NULL,
  "hearts" INTEGER[] NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "wish_favourite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wish_favourite_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "wish_favourite_wishId_session_key" ON "wish_favourite"("wishId", "session");

-- the public link's limits, counted in the database: a bucket, a key (a hash of the address, never the address) and the time
CREATE TABLE "link_hit" (
  "id" UUID NOT NULL,
  "bucket" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "link_hit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "link_hit_bucket_key_at_idx" ON "link_hit"("bucket", "key", "at");
