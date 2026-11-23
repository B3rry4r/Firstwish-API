PATCH P-API-BASE-16 round 1 | TIER T1 | Budget 35 steps. Two findings from the check; change nothing else.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f; final runs in the FOREGROUND.
Read /home/user/Firstwish-API/build/prompts/API-BASE-16.md (case 1: "in the same shape the public wish read gives a player, so a preview
plays it with no second code path") and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-16/VERDICT.md.
Work: branch `api-base-16` (93166e9) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-16 (`npm ci`,
prisma generate); TEST_DB_PREFIX=ab16. The registry: the same ONE-reopen rule if the wire shape changes (it does:
additive fields on the two new reads only; no older id touched).
 K1 MEDIUM the sample's shape lacks fields an OPEN public wish view (E-129) carries and a player reads:
    content.files, openedAt, endsAt, opening, keepOffer, styleSlug, timeZone, serverTime, wishNo, house. E-288 and
    each item of E-287 carry EVERY field the open E-129 view has, with the same names and types (declare the
    sample's contract type from the public wish view's own type, plus `sample: true`, so the two cannot drift: a
    test that compares the keys of a real open wish's view with a sample's, recursively), each with a truthful
    fixed value for a sample: openedAt = its opensAt; endsAt, opening, keepOffer null; styleSlug "" (the preview
    names the style); timeZone as the source says or the default the wish read uses; serverTime now; wishNo
    null; house false; content.files as the content's own files. Nothing private added.
 K2 MEDIUM (a test that fails at random) src/modules/sample-wishes/tests/ab16-sample-wishes.spec.ts:193 uses a
    global db.wish.count() in the shared test database (936 against 938 in a full run): count only what the test
    can own (its own database through test/kit/own-db.ts, or rows it can name); grep the new spec for any other
    whole-table count or read.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, gates.sh, check-contracts, check-drift,
check-routes, the sample-wishes and reference-data specs, then `WEB_LIB=/nonexistent/lib npm test --
--maxWorkers=2` once: 0 failed. Commit on api-base-16; do not push; remove your worktree. Hand back ONCE in 6
lines: head; K1, K2 with file:line and the tests' names; decision ids if any; totals.
