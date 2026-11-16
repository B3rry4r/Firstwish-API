PATCH wave 4 join | TIER T2 | Budget 100 steps. The last joins between this wave's bundles. Keep the diff small.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, and in build/rulings-phase3.md: OO5, QQ3, QQ4, SS1, RR3.
Base: local branch `int-4` (the lead gives its head in the spawn line): the shared base plus refunds, Now Showing and
moderation, and business are all merged in it with their patches. Work: local branch `p-join4` from int-4; worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join4 (`npm ci`); ports 4680-4689; TEST_DB_PREFIX=pjoin4 for every run. You may touch src/modules/** and, for J5 only,
the ClientWish and Wish erase rules in .pipeline/schema-map.json; any other shared change (src/common, registry, prisma,
src/contracts): HALT AND REPORT.
 J1 (OO5): the Pro plan, the pack and the Vault handlers call invoices.issue(tx, payment) inside the settle transaction; a
    refund calls invoices.voidFor(tx, paymentId) inside the refund's transaction. Tests: a settled plan payment leaves one
    invoice with the next number and the VAT part; a rolled-back settle leaves none and gives the number back; a refund voids it.
 J2 (QQ3): the owner's wish detail carries `publish` (WishesService.get calls ShowingService.publishStateOf). Test.
 J3 (QQ4, SS1): the lifecycle calls ShowingService.dropForWishes in the same transaction when a wish rests, is taken down, is
    removed or is erased; the account erase calls dropForAccount. Tests: after each, no row of that wish is left in the
    showing tables and the public list does not hold it; a wish that comes back needs a new ask.
 J4: a refund of a ticket whose wish is listed: the wish follows the refund rules already in place; the list is consistent
    after (say what happens; no new rule).
 J5 (RR3): erasing a business owner's account closes the business; client wishes already sent keep playing to the end of
    their term and are erased when the term ends (they do not rest a year); the owner's personal data and the business's
    record of the client (name, contact) go at once. Tests: the receiver's link of a sent client wish still plays after the
    erase and is gone after its term; an unsent client wish is erased at once.
 J6: every spec passes together: fix any spec that reads another spec's rows (count only your own) or runs jobs without `only`.
Checks (quiet logs, EXIT lines): build, typecheck, lint on changed files, gates.sh, check-contracts, migrate deploy on a fresh
database, `npm run test:affected -- src/modules src/common test` THREE times (a failure in any run is a finding: name the test and
its cause); then `scripts/stack.sh up pjoin4 4680`, GET /v1/health and one unauthenticated call per new module (401 or 404 in
the envelope), then down.
Commit (do not push); remove your worktree and databases. Hand back in 8 lines: head sha; J1 to J6 closed or not with test names;
any test that failed in any of the three runs and why; counts (tests, suites); EXIT lines.
