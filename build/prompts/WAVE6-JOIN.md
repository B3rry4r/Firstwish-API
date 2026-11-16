PATCH wave 6 join | TIER T2 | Budget 140 steps. Merge the last bundles and patches and make the last joins. Keep the diff small.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, and in build/rulings-phase3.md: ZB3, ZB4, ZB5, GB1, EA3,
EA4, EB1, FA1, SS1.
Base: claude/sleepy-mayer-f0hkb8 (the lead gives its head in the spawn line). Work: local branch `p-join6` from it; worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join6 (`npm ci`); ports 5020-5029; TEST_DB_PREFIX=pjoin6 for every run. You may touch src/modules/** and
scripts/seed.mjs; any other shared change (src/common, registry, schema.prisma, src/contracts, build/baselines): HALT AND REPORT.
 J0 (merges, first): merge the local branches the lead names (Staff reads with its patch; the plan-wish and creator's-share
    patches; the two bundles of missed routes with their patches) with merge commits whose messages end with the two trailer
    lines the other commits carry. Where both sides added something, keep both (notices catalog, seed and spec lists;
    src/app.module.ts; account-erasure; wishes.service). Never drop a side's test. A conflict that is not "keep both": STOP
    and report the file and the two versions.
 J1 (ZB4, ZB5): a wish that carries a business is reached only through the business. When a login is removed, or their own
    account is erased, the business's wishes they made (drafts and sealed) pass to the business owner's account in the same
    transaction; the removed login gets 404 on them and can neither read nor seal them; they keep playing. Tests through the
    real routes.
 J2 (GB1): the ordinary seal of a wish that carries a business calls the same royalty accrual as the maker's usePlan seal,
    reading month or pack from its client-wish record. Tests: a wish made from the sheet (E-30) and from a date (E-32),
    style changed to a creator's Premium style, sealed: the right share by hand; Standard: none; a replay adds nothing.
    A wish earns once whichever seal runs and whichever payment it is counted against: accrueForDraw refuses a wish that
    already has a draw accrual (the verifier wrote two by calling it with pack then month). Test.
 J3 (EA3): the Vault's limit counts the plan's space only while the plan is live (a lapsed plan is refused at the upload
    ticket too); the peak is lifted on the file-confirm path. Tests.
 J4 (EA4): after an owner's erase, a client wish's reveal (name, note, credits) is blanked at the end of its term with the
    rest. Test scans every table for the strings.
 J5 (EB1): sending a reveal: 5 emails a day to one address from one business and 100 a day for a business, counted in the
    database in one statement, fail closed; 20 at once with 2 left send 2. Tests.
 J6 (FA1): a Concierge payment books vat_payable as a Pro payment does, so its invoice's VAT part equals the ledger; the
    invoices of creator plans, credit packs and reviews state the total with NO VAT part (the owner has not said they carry
    VAT). Tests by hand.
 J7: every spec passes together: the Vault spec uses its own address for public reads; fix any spec that reads another
    spec's rows, shares an address or a clock, or runs jobs without `only`.
 J8: run `node scripts/check-routes.mjs` and `node scripts/check-drift.mjs`: do NOT edit the baselines; list in your hand-back
    the baseline lines that can now go (routes that exist) and any raw-SQL table the drift check names.
Checks (quiet logs, EXIT lines): build, typecheck, lint on changed files, gates.sh, check-contracts, migrate deploy on a fresh
database, `npm test` (the full suite, --maxWorkers=2) THREE times (a failure in any run is a finding: name the test and its
cause); then `scripts/stack.sh up pjoin6 5020`, GET /v1/health and one unauthenticated call per new module, then down.
Commit (do not push); remove your worktree and databases. Hand back in 14 lines: head sha; J0 to J8 closed or not with test
names; the baseline lines to remove; any test that failed in any run and why; counts; EXIT lines.
