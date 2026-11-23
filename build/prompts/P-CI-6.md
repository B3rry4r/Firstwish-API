PATCH P-CI-6 | TIER T1 (a staff route under parallel calls) | Budget 40 steps. One test failed in CI's full run and passed in the next; find why and fix the cause.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f; final runs in the FOREGROUND.
Read /home/user/Firstwish-API/build/common-rules.md and the CI text in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ci437/fail.txt (CI run 437, head
1f505b7; the next run on the next commit was green).
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci6 of /home/user/Firstwish-API on a new local branch `p-ci-6`
from claude/sleepy-mayer-f0hkb8 (the head in your spawn line); `npm ci`, `npx prisma generate`; TEST_DB_PREFIX=pci6.
The failure: src/modules/support/tests/ab15-w14b-hand-over.spec.ts:84-86: 20 hand-overs of one thread at once, each
sending the holder it saw: the test expects one 200 and nineteen 409 (thread_changed_hands). CI got one 200 and
only THREE 409: sixteen answers were something else.
 1. Find what the sixteen were: run that parallel step 50 times and tally every status and error code (print the
    bodies of anything that is not 200 or 409 thread_changed_hands). Likely: a rate limit (429) on the route or
    per address; a 500 from two transactions colliding (a serialization or deadlock error not turned into the
    409); a 409 with a different code; a connection limit.
 2. If the SERVER answers a 5xx or a wrong code for a hand-over that lost the race: that is a server bug: every
    loser answers 409 thread_changed_hands in words (retry the read inside the route or lock the thread row, as
    the other parallel-safe routes in this codebase do: find one and follow it); a test that runs the 20 at once
    30 times with exactly one 200 and nineteen 409 each time.
 3. If it is the rate limiter: the limit is right for a real person and wrong for the test: the test sends each
    call from its own address (uniqueAddress() in test/kit/app.ts) or uses the kit's way to lift the limit for an
    attack test (find how the other parallel attack tests do it); never raise or remove the limit in src.
 4. Whatever the cause: no expectation loosened, no retry around the assertion, no skipped test.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, gates.sh, the support specs, the spec alone
20 times in a row: 0 failed, then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0 failed. Commit on
p-ci-6; do not push; remove your worktree. Hand back ONCE in 6 lines: head; THE CAUSE with the tally and
file:line; what changed; totals.
