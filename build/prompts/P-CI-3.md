PATCH P-CI-3 | TIER T1 test-only | Budget 50 steps. Two kinds of test that fail at random in the lead's merge runs; fix both kinds everywhere; change no src file that is not a test or a test kit.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit as you go; stop only PIDs you started. If the
branch or worktree already exists, an earlier agent was lost: read git log and carry on.
Read /home/user/Firstwish-API/build/common-rules.md and test/kit/unique.ts, test/kit/own-db.ts, uniqueAddress() in test/kit/app.ts.
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci3 of /home/user/Firstwish-API on a new local branch `p-ci-3` from claude/sleepy-mayer-f0hkb8 (the head in
your spawn line); `npm ci`, prisma generate; TEST_DB_PREFIX=pci3. Run every command with your own worktree as the
working directory.
 1. Short random values on a unique column. The lead's run failed src/modules/staff-reads/tests/staff-reads.spec.ts
    "every wish action x every staff role" with "Unique constraint failed on the fields: (slug)" at
    src/modules/staff-reads/tests/kit.ts:47 (`ada-${hex(2)}`: 65,536 values, and that test makes many wishes).
    Every test kit and spec that builds a slug, a wish number, a handle, a reference, an email or any value for a
    unique column from fewer than 60 random bits (hex(1), hex(2), hex(3), Math.random, a counter, Date.now, the
    pid) takes it from test/kit/unique.ts instead (add a helper there if one is missing; do not fork). Grep for
    them ALL (list the patterns you searched and every place fixed in your hand-back).
 2. Attack loops under the default time limit. The lead's run (2 workers, a busy machine) failed
    src/modules/pro-business/tests/api-base-8-plan-drop.spec.ts test 8 (30 drop-and-settle pairs) on jest's 20 s
    limit; alone it passes. Every test whose body loops 20 or more times over real requests gets a time limit that
    fits its work (the third argument of it(), sized from its measured time alone times four), not a global
    change of the default. List each one.
Checks: typecheck, eslint on changed files, gates.sh EXIT 0; each changed spec alone once; then the full suite THREE
times in the FOREGROUND, once of them with `npm test -- --maxWorkers=2` while you also run `npx tsc --noEmit` in a
loop beside it to load the machine (say the load you saw): EXIT 0 three times, with the Tests: line of each.
Commit on p-ci-3; do not push; remove your worktree and databases; leave no jobs. Hand back ONCE in 8 lines.
