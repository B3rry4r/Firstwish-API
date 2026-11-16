PATCH wave 5 join | TIER T2 | Budget 130 steps. Merge this wave's four bundles and make the last joins. Keep the diff small.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, and in build/rulings-phase3.md: WW1, WW2, YY4, CA3, ZZ8,
and the last six rows of build/sweeps/api.md.
Base: claude/sleepy-mayer-f0hkb8 (the lead gives its head in the spawn line; wave 4 is in it). Work: local branch `p-join5` from
it; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join5 (`npm ci`); ports 4880-4889; TEST_DB_PREFIX=pjoin5 for every run. You may touch src/modules/** and
scripts/seed.mjs; any other shared change (src/common, registry, schema.prisma, src/contracts, build/baselines): HALT AND REPORT.
 J0 (merges, first): merge local branches p-b16, p-b20, p-b15 and p-b19 (the heads the lead names) with merge commits. Where
    both sides added something, keep both: the notices catalog and seed hold every message (invite, login-invite, support,
    bank-changed, concierge-delivered, and the six before); src/app.module.ts keeps every block; scripts/seed.mjs keeps the
    drafts values and never overwrites edited wording; account-erasure keeps the Studio erase with the wave 4 rules. Never
    drop a side's test; update list expectations that count messages.
 J1 (WW1): the payments webhook passes transfer.* events to the payout sink. Test through the webhook route with a signed
    event: a payout is marked paid once; a replay changes nothing.
 J2 (WW2): the ticket and extra handlers call royalties.accrue(tx, payment) in the settle transaction; the refund calls
    royalties.reverse(tx, paymentId) in its transaction. Tests end to end: a person pays for a wish in a creator's Premium
    style: one accrual of 20% of the premium style price; a Standard style: none; the refund's event: one reversal.
 J3 (YY4): Support and Concierge set refund_due through the refunds module's own helper (one way to flag a payment).
 J4: the Signed fulfil handler writes the grant's endsAt (start + the price-book line's days); a payout marked paid by hand
    ignores later provider events and flags them for staff (ZZ8). Tests.
 J5 (CA3): a business's Concierge order and a creator plan payment each leave an invoice through invoices.issue where the
    payer is a business (T-40); a person's does not. Test.
 J6: run `node scripts/check-drift.mjs`: it will name raw-SQL tables that are not in build/baselines/drift-tables.txt. Do NOT
    edit the baseline: list the tables and their migrations in your hand-back (the lead adds them).
 J7: every spec passes together: fix any spec that reads another spec's rows or runs jobs without `only`.
Checks (quiet logs, EXIT lines): build, typecheck, lint on changed files, gates.sh, check-contracts, migrate deploy on a fresh
database, `npm run test:affected -- src/modules src/common test` THREE times (a failure in any run is a finding: name the test
and its cause); then `scripts/stack.sh up pjoin5 4880`, GET /v1/health and one unauthenticated call per new module (401 or 404
in the envelope), then down.
Commit (do not push); remove your worktree and databases. Hand back in 12 lines: head sha; J0 to J7 closed or not with test
names; the tables for the baseline; any test that failed in any of the three runs and why; counts; EXIT lines.
 J8 (Studio re-check, added by the lead): studio-doc.ts shapeParts also checks `art` (an AI answer with a bad `art` is 502 with
    the credits back, as a save refuses it); a draft wish saved again with its own current style is accepted even after that
    style has gone off (wishes.service.ts:302: only a CHANGE to an off style is 422). Tests for both.
