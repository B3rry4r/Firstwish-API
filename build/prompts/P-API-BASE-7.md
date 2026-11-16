PATCH P-API-BASE-7 | TIER T2 | Budget 70 steps. The check's findings; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HX1-HX5 and HW1-HW7 in build/rulings-phase3.md, and the verifier's probes in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab7/ (run the ones for findings 1, 3, 4, 5 FIRST and see them fail on this head).
Work: commit on local branch `api-base-7` (9d34bec) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab7 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab7 api-base-7`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab7. Run every command
with your own worktree as the working directory. If the registry must change (a new staff write), ONE reopen as
API-BASE-7 did; ids already issued never change. No deferral phrasing in src comments.
 F1 (medium, HX1) Staff Prices changes every book value the read serves (file limits, Concierge delivery hours,
    unopened days, payout threshold and day): the roles that change prices, audited, the read and the code move
    together; tests go through the staff route (no direct table update).
 F2 (medium, HX2) Nothing calls unopenedDays an erase period: fix the names, comments and contract words; the
    erase stays at once.
 F3 (medium, HX3) Deleting a draft style removes its files and bytes; confirming an upload for a deleted style is
    404; the sweep takes a file whose style no longer exists. Say in the hand-back whether the dropped foreign key
    can come back (a draft's id is a real style row?) and bring it back if it can.
 F4 (medium, HX4) Erasing an account: an approved style that stays in the catalogue keeps its files and still plays
    (the player read gives them); the drafts, their files and the profile picture go; the kept files carry no link
    to the erased account.
 F5 (medium, HX5) The session read's actions cover every staff write section, drawn from the guard's own table; a
    test walks every staff write for each role and compares the read with the route's answer (no mismatch).
 F6 (low) The migration backfills signedUntil for a creator already Signed (from their last Signed payment's paid
    day; none: the day the migration runs plus the paid period), so PATCH signed:false works for them.
Checks (quiet logs, EXIT lines): typecheck, eslint on the changed files, gates.sh, check-contracts, check-drift,
check-routes, the affected specs, `npm test -- --maxWorkers=2` once with 0 failed. Commit on api-base-7; do not push;
remove your worktree and databases; leave no background jobs. Hand back ONCE in 8 lines: head; F1-F6 closed or not
with file:line and the test's name; new ids; totals; `git diff --stat` against 9d34bec.
