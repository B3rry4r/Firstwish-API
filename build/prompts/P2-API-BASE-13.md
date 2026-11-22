PATCH P-API-BASE-13 round 2 (the last round) | TIER T2 | Budget 45 steps. Close G1 and G2 from the re-check; change nothing else.
ONE heavy job at a time, jest with `--maxWorkers=2`; commit per finding; final runs in the FOREGROUND.
Read ruling II4 (and II3) in /home/user/Firstwish-API/build/rulings-phase3.md and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-13/VERDICT2.md. Work: branch `api-base-13` (8d28b97) of /home/user/Firstwish-API in a new
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-13 (`npm ci`, prisma generate); TEST_DB_PREFIX=ab13; ports 5200-5209.
 G1 MEDIUM src/modules/studio/studio-files.service.ts:104-106 (II4): after the creator deletes one picture that
    approved version 1 names and version 2 is approved, a paid v1 wish plays a document naming 2 pictures and is
    given 1: a picture is quietly missing. A file named by an approved version that can still be played is KEPT
    when its creator deletes it: it leaves the creator's draft, list (E-267) and limits, and the link of a wish
    made under that version (and E-196 while that version is the newest approved) still gives it with an address.
    It is removed for good only when no playable approved version names it (the existing cleanup may do that;
    prove it does not take a kept file). Tests: the verifier's case (v1 wish plays 2 of 2 after the delete and
    v2's approval); the creator's list and the 30-in-a-draft limit no longer count it; a file no approved version
    names is deleted at once as today; the erased-creator case still passes; another creator cannot reach it.
 G2 LOW prisma/migrations/20261205090000_wish_style_version_ab13r1/migration.sql:23 (not merged yet, so it may
    still be edited): a wish made after v2 was SENT IN but before it was APPROVED gets v2. The fill, and the
    run-time choice at a wish's making, use the moment of approval (the version that was approved and live when
    the wish was made), not when it was sent in; the same for which files a version's wishes are given (no v2
    draft uploads on a v1 wish). Tests for both; the migration twice identical.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, gates.sh, check-contracts, check-drift,
check-routes, the studio and vault specs, then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0
failed. Commit on api-base-13; do not push; remove your worktree. Hand back ONCE in 8 lines: head; G1, G2 with
file:line and the tests' names; any new column; totals.
