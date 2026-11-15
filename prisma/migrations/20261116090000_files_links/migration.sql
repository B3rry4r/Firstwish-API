-- B09 Files: every *FileId column is linked to stored_file (build/sweeps/api.md).
-- The columns are text (and two hold lists: ai_request.fileIds JSON, support_message.fileIds text[]), so a plain FOREIGN KEY to the uuid
-- stored_file.id cannot be declared without retyping them in schema.prisma. The link is kept by triggers instead, which Prisma's drift
-- check does not see: a row may only name files that exist (taking KEY SHARE on the file, as a foreign key would), and a file may not be
-- deleted while a row still names it. Reads granted (signed_url) and screening results go with their file (cascade).

CREATE OR REPLACE FUNCTION fw_file_refs_exist() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  col text;
  v jsonb;
  item text;
  row_j jsonb := to_jsonb(NEW);
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    v := row_j -> col;
    IF v IS NULL OR v = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    FOR item IN
      SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v) = 'array' THEN v ELSE jsonb_build_array(v) END) AS t(x)
    LOOP
      IF item !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'file reference % in %.% is not a stored file', item, TG_TABLE_NAME, col USING ERRCODE = '23503';
      END IF;
      PERFORM 1 FROM stored_file WHERE id = item::uuid FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'file reference % in %.% is not a stored file', item, TG_TABLE_NAME, col USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END
$$;

CREATE TRIGGER ai_request_file_refs BEFORE INSERT OR UPDATE ON "ai_request"
  FOR EACH ROW EXECUTE FUNCTION fw_file_refs_exist('inputFileId', 'voiceFileId', 'fileIds');
CREATE TRIGGER concierge_order_file_refs BEFORE INSERT OR UPDATE ON "concierge_order"
  FOR EACH ROW EXECUTE FUNCTION fw_file_refs_exist('namesFileId', 'reportFileId');
CREATE TRIGGER qr_card_file_refs BEFORE INSERT OR UPDATE ON "qr_card"
  FOR EACH ROW EXECUTE FUNCTION fw_file_refs_exist('fileId');
CREATE TRIGGER render_job_file_refs BEFORE INSERT OR UPDATE ON "render_job"
  FOR EACH ROW EXECUTE FUNCTION fw_file_refs_exist('outputFileId');
CREATE TRIGGER signed_url_file_refs BEFORE INSERT OR UPDATE ON "signed_url"
  FOR EACH ROW EXECUTE FUNCTION fw_file_refs_exist('fileId');
CREATE TRIGGER support_message_file_refs BEFORE INSERT OR UPDATE ON "support_message"
  FOR EACH ROW EXECUTE FUNCTION fw_file_refs_exist('fileIds');
CREATE TRIGGER screening_result_file_refs BEFORE INSERT OR UPDATE ON "screening_result"
  FOR EACH ROW EXECUTE FUNCTION fw_file_refs_exist('fileId');

CREATE OR REPLACE FUNCTION fw_stored_file_still_used() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k text := OLD.id::text;
BEGIN
  DELETE FROM "signed_url" WHERE "fileId" = k;
  DELETE FROM "screening_result" WHERE "fileId" = k;
  IF EXISTS (SELECT 1 FROM "ai_request" WHERE "inputFileId" = k OR "voiceFileId" = k
               OR (jsonb_typeof("fileIds") = 'array' AND "fileIds" ? k))
     OR EXISTS (SELECT 1 FROM "concierge_order" WHERE "namesFileId" = k OR "reportFileId" = k)
     OR EXISTS (SELECT 1 FROM "qr_card" WHERE "fileId" = k)
     OR EXISTS (SELECT 1 FROM "render_job" WHERE "outputFileId" = k)
     OR EXISTS (SELECT 1 FROM "support_message" WHERE k = ANY("fileIds")) THEN
    RAISE EXCEPTION 'stored file % is still used', k USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER stored_file_still_used BEFORE DELETE ON "stored_file"
  FOR EACH ROW EXECUTE FUNCTION fw_stored_file_still_used();
