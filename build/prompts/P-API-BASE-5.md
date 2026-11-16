PATCH P-API-BASE-5 | TIER T2 | Budget 45 steps. The verifier's named findings only; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, ruling HQ5 in build/rulings-phase3.md, and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab5/VERDICT.md (its probe specs are beside it: reproduce finding H1 FIRST as a failing test).
Work: commit on local branch `api-base-5` (baf4719) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab5 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab5 api-base-5`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab5. Work ONLY there.
 H1 (high, HQ5) src/modules/wishes/wishes.service.ts near line 676: the seal checks the style against the ticket the
    seal REALLY ends with, on every way a seal gets its ticket (paid ticket, a Pass drawing a Keepsake, a plan or pack
    drawing its ticket, any other): a style above that ticket is 422 naming the style and saying which ticket it has
    and what would allow it; nothing is drawn, charged or sealed when it refuses (the Pass counter, the pack and the
    plan's month unchanged: prove it). Tests through the real routes: a Pass seal with a Premium style (the verifier's
    case: was 200); the same after PATCH with no ticket; a plan seal with each level; a pack seal; a paid Moment; the
    premium-style extra where it lifts. One function decides (the one PATCH uses).
 M1 Lint is clean on a fresh `npm ci` (wishes.service.ts:471 `as string` is an unnecessary assertion): run eslint on
    every file the branch changed against claude/sleepy-mayer-f0hkb8, 0 errors.
 M2 The stand-in storage (test stacks only) is bounded: a total-bytes cap (256 MB unless a ruling says otherwise)
    with the oldest objects dropped first and a clear answer when a read meets a dropped object; a put's body is cut
    off as soon as it passes the ticket's size (not read to the end). L1 a second put to the same ticket is refused
    once the first has landed, and always after confirm (the bytes screened are the bytes kept).
Checks (quiet logs, EXIT lines): typecheck, eslint as M1 says, gates.sh, check-contracts, check-routes, the affected
specs, `npm test -- --maxWorkers=2` once (the reference-data "seed equals the web app's own files" test may fail here
because the web checkout moved: report it apart). Commit on api-base-5; do not push; remove your worktree and
databases; leave no background jobs. Hand back ONCE in 8 lines: head; H1, M1, M2, L1 closed or not with file:line and
the test's name; totals; `git diff --stat` against baf4719.
