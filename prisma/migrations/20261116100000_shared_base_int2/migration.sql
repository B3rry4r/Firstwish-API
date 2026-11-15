-- INT-2 shared base: X4 (event key, replay counts once; index for the style counts), X9 (published_wish.wishId, a real foreign key),
-- X23 (every *FileId a uuid with a real foreign key to stored_file; B09's link triggers dropped, Y2), X25 (stored_file.kind the media
-- kind), X20 (signed_url records when the read ends; the link itself is never stored), Y5 (wish_file: the files a wish names).
-- Columns are retyped in place (USING casts), never dropped and re-added, so rows keep their values.

-- Y2/X23: the triggers go; the foreign keys below keep the links.
DROP TRIGGER IF EXISTS ai_request_file_refs ON "ai_request";
DROP TRIGGER IF EXISTS concierge_order_file_refs ON "concierge_order";
DROP TRIGGER IF EXISTS qr_card_file_refs ON "qr_card";
DROP TRIGGER IF EXISTS render_job_file_refs ON "render_job";
DROP TRIGGER IF EXISTS signed_url_file_refs ON "signed_url";
DROP TRIGGER IF EXISTS support_message_file_refs ON "support_message";
DROP TRIGGER IF EXISTS screening_result_file_refs ON "screening_result";
DROP TRIGGER IF EXISTS stored_file_still_used ON "stored_file";
DROP FUNCTION IF EXISTS fw_file_refs_exist();
DROP FUNCTION IF EXISTS fw_stored_file_still_used();

-- CreateEnum
CREATE TYPE "StoredFileKind" AS ENUM ('image', 'sound', 'model', 'video');

-- CreateEnum
CREATE TYPE "WishFileRole" AS ENUM ('photo', 'voice', 'clip', 'cover', 'sound', 'model');

-- AlterTable
ALTER TABLE "ai_request" ALTER COLUMN "inputFileId" SET DATA TYPE UUID USING ("inputFileId"::uuid),
ALTER COLUMN "voiceFileId" SET DATA TYPE UUID USING ("voiceFileId"::uuid);

-- AlterTable
ALTER TABLE "concierge_order" ALTER COLUMN "namesFileId" SET DATA TYPE UUID USING ("namesFileId"::uuid),
ALTER COLUMN "reportFileId" SET DATA TYPE UUID USING ("reportFileId"::uuid);

-- AlterTable
ALTER TABLE "event" ADD COLUMN     "key" TEXT;

-- AlterTable
ALTER TABLE "published_wish" ADD COLUMN     "wishId" UUID;

-- X9: rows that named a wish by its id in the old text column keep the link
UPDATE "published_wish" p SET "wishId" = w."id" FROM "wish" w
 WHERE p."wish" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND w."id" = p."wish"::uuid;

-- AlterTable
ALTER TABLE "qr_card" ALTER COLUMN "fileId" SET DATA TYPE UUID USING ("fileId"::uuid);

-- AlterTable
ALTER TABLE "render_job" ALTER COLUMN "outputFileId" SET DATA TYPE UUID USING ("outputFileId"::uuid);

-- AlterTable
ALTER TABLE "screening_result" ALTER COLUMN "fileId" SET DATA TYPE UUID USING ("fileId"::uuid);

-- AlterTable
ALTER TABLE "signed_url" ADD COLUMN     "expiresAt" TIMESTAMPTZ(3),
ALTER COLUMN "fileId" SET DATA TYPE UUID USING ("fileId"::uuid);

-- AlterTable
ALTER TABLE "stored_file" ALTER COLUMN "fileId" SET DATA TYPE UUID USING ("fileId"::uuid),
ALTER COLUMN "kind" SET DATA TYPE "StoredFileKind" USING (("kind" #>> '{}')::"StoredFileKind");

-- CreateTable
CREATE TABLE "wish_file" (
    "id" UUID NOT NULL,
    "wishId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "role" "WishFileRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wish_file_wishId_id_idx" ON "wish_file"("wishId", "id");

-- CreateIndex
CREATE INDEX "wish_file_fileId_id_idx" ON "wish_file"("fileId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wish_file_wishId_fileId_role_key" ON "wish_file"("wishId", "fileId", "role");

-- CreateIndex
CREATE INDEX "ai_request_inputFileId_id_idx" ON "ai_request"("inputFileId", "id");

-- CreateIndex
CREATE INDEX "ai_request_voiceFileId_id_idx" ON "ai_request"("voiceFileId", "id");

-- CreateIndex
CREATE INDEX "concierge_order_namesFileId_id_idx" ON "concierge_order"("namesFileId", "id");

-- CreateIndex
CREATE INDEX "concierge_order_reportFileId_id_idx" ON "concierge_order"("reportFileId", "id");

-- CreateIndex
CREATE INDEX "event_styleSlug_name_at_idx" ON "event"("styleSlug", "name", "at");

-- CreateIndex
CREATE UNIQUE INDEX "event_name_accountId_key_key" ON "event"("name", "accountId", "key");

-- CreateIndex
CREATE INDEX "published_wish_wishId_id_idx" ON "published_wish"("wishId", "id");

-- CreateIndex
CREATE INDEX "qr_card_fileId_id_idx" ON "qr_card"("fileId", "id");

-- CreateIndex
CREATE INDEX "render_job_outputFileId_id_idx" ON "render_job"("outputFileId", "id");

-- CreateIndex
CREATE INDEX "screening_result_fileId_id_idx" ON "screening_result"("fileId", "id");

-- CreateIndex
CREATE INDEX "screening_result_verdict_id_idx" ON "screening_result"("verdict", "id");

-- CreateIndex
CREATE INDEX "signed_url_fileId_id_idx" ON "signed_url"("fileId", "id");

-- CreateIndex
CREATE INDEX "stored_file_fileId_id_idx" ON "stored_file"("fileId", "id");

-- CreateIndex
CREATE INDEX "style_level_id_idx" ON "style"("level", "id");

-- AddForeignKey
ALTER TABLE "ai_request" ADD CONSTRAINT "ai_request_inputFileId_fkey" FOREIGN KEY ("inputFileId") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_request" ADD CONSTRAINT "ai_request_voiceFileId_fkey" FOREIGN KEY ("voiceFileId") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concierge_order" ADD CONSTRAINT "concierge_order_namesFileId_fkey" FOREIGN KEY ("namesFileId") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "concierge_order" ADD CONSTRAINT "concierge_order_reportFileId_fkey" FOREIGN KEY ("reportFileId") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "published_wish" ADD CONSTRAINT "published_wish_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_card" ADD CONSTRAINT "qr_card_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "render_job" ADD CONSTRAINT "render_job_outputFileId_fkey" FOREIGN KEY ("outputFileId") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "screening_result" ADD CONSTRAINT "screening_result_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_url" ADD CONSTRAINT "signed_url_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_file"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "wish_file" ADD CONSTRAINT "wish_file_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_file" ADD CONSTRAINT "wish_file_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

