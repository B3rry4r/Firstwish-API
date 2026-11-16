-- INT-7 leftovers. Three small steps, all additive for the rows that exist.
-- 1. An account row is never deleted: the erase path only blanks it (AA1), and payments, refunds and ledger rows point at it with
--    SET NULL, so a hard delete would quietly cut the money trail loose. The database refuses it.
-- 2. NumbersTarget.setBy (the staff account that set a target) gets its foreign key. Every row E-80 wrote carries a real staff id.
-- 3. A client wish records when its draw was given back to the business (a draft removed for good), so the give-back happens once per wish.

CREATE OR REPLACE FUNCTION fw_refuse_account_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'account rows are never deleted: erase blanks them' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER account_no_delete BEFORE DELETE ON "account" FOR EACH ROW EXECUTE FUNCTION fw_refuse_account_delete();

-- CreateIndex
CREATE INDEX "numbers_target_setBy_id_idx" ON "numbers_target"("setBy", "id");

-- AddForeignKey
ALTER TABLE "numbers_target" ADD CONSTRAINT "numbers_target_setBy_fkey" FOREIGN KEY ("setBy") REFERENCES "staff_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "client_wish" ADD COLUMN     "drawnBackAt" TIMESTAMPTZ(3);
