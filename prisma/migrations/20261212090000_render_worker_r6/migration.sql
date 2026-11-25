-- R6: the video maker's own worker counts losses on the render row, remembers who holds it and what the last run did.
ALTER TABLE "render_job" ADD COLUMN "losses" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failureWords" TEXT,
  ADD COLUMN "workerId" TEXT,
  ADD COLUMN "tookMs" INTEGER,
  ADD COLUMN "videoMs" INTEGER;
