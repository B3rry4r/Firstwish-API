PATCH P-API-BASE-7b | TIER T2 small | Budget 30 steps. One finding from the second check; a diff of 30 lines or fewer (tests apart) that the lead reads; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md and ruling HX1 in build/rulings-phase3.md. Work: commit on local branch `api-base-7` (90a5ea3) of
/home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab7b (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab7b api-base-7`; `npm ci`; prisma generate);
ports 5200-5209; TEST_DB_PREFIX=pab7b. Run every command with your own worktree as the working directory.
 F1 (medium) src/modules/price-book/price-admin.service.ts:~311 (changeLimit): the audit row of a limit change has
    before=null and after={fields:["value"]}: it must carry the key, the old value and the new value (as a price
    change's audit does), read inside the same transaction that writes the change (two changes at once leave two
    rows whose old and new values chain). Test through the staff route: change a limit twice; the audit read shows
    key, old, new and who for each; two changes at once chain.
 Not in this patch (the lead accepted it with a sweep row): an older book version does not hold its own limits.
Checks (quiet logs, EXIT lines): typecheck, eslint on the changed files, gates.sh, check-contracts, the price-book
specs. Commit on api-base-7; do not push; remove your worktree and databases; leave no background jobs. Hand back
ONCE in 5 lines: head; file:line; the test's name; EXIT lines; `git diff --stat` against 90a5ea3.
