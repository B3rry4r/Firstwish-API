-- API-BASE-9 (IB1, IB2, IB3, HZ2). Additive only.
-- IB1: the photo positions a client marked at a reveal link (positions in the link's file list); IB2: whether the link gives download addresses (finals only).
ALTER TABLE "reveal_access" ADD COLUMN "hearts" INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE "reveal_access" ADD COLUMN "downloads" BOOLEAN NOT NULL DEFAULT true;
-- IB3: the name a Vault file shows under when the business renamed it (the stored object keeps its own name).
ALTER TABLE "stored_file" ADD COLUMN "shownName" TEXT;
