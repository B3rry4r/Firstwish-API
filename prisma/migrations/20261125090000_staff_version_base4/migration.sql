-- API-BASE-4 (HP7): every team change bumps the member's version; a change carries the version it saw. Additive: existing rows start at 0.
ALTER TABLE "staff_account" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
