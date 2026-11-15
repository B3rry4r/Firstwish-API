-- The ledger is append-only: a row is never updated or deleted, and the table is never truncated (ledger declaration,
-- "every kobo that moves is a ledger row"). A correction is a new journal that reverses the old one.
-- The audit log is never edited (audit-log declaration); rows past retention are removed by the retention job only.
CREATE OR REPLACE FUNCTION fw_refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER ledger_entry_no_update BEFORE UPDATE ON "ledger_entry" FOR EACH ROW EXECUTE FUNCTION fw_refuse_change();
CREATE TRIGGER ledger_entry_no_delete BEFORE DELETE ON "ledger_entry" FOR EACH ROW EXECUTE FUNCTION fw_refuse_change();
CREATE TRIGGER ledger_entry_no_truncate BEFORE TRUNCATE ON "ledger_entry" FOR EACH STATEMENT EXECUTE FUNCTION fw_refuse_change();
CREATE TRIGGER audit_entry_no_update BEFORE UPDATE ON "audit_entry" FOR EACH ROW EXECUTE FUNCTION fw_refuse_change();
