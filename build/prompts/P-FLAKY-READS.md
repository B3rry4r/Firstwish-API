PATCH flaky test | TIER T1 | Budget 30 steps. One test fails some of the time. Find why; fix the cause.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md (specs share one database; own clock and address).
The fact: on the merged head, `npm test -- --maxWorkers=2` failed once in src/modules/public-wishes/tests/public-wishes.contract.spec.ts,
test "60 reads a minute per address answer 429, and 100 wrong slugs are 404 then 429": after 60 reads that each answered 200,
the 61st answered 200 where 429 was expected (line 232). Two earlier agents saw the same test fail once and called it a
minute-boundary flake without proving it.
Work: local branch `p-flaky-reads` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flaky-reads (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; TEST_DB_PREFIX=pflakyr. Stay inside
src/modules/public-wishes (link-limits.ts and its callers) and its tests, plus the Vault's use of the same limiter if the
fix belongs in the shared function.
 1. Read how the window is counted (link-limits.ts: which clock decides the minute: the Clock port, the database's now(), or
    wall time; a fixed or a sliding window). Say in one line why a 61st read inside the test's own minute could pass.
 2. Reproduce (the spec 40 times alone and 10 times beside `npm test`; or a deterministic case that sets the clock just
    before a window edge).
 3. Decide by evidence: if a real visitor can make more than 60 reads in any 60 seconds because of how the window is cut,
    say so plainly with the numbers (a fixed window lets up to 119 through across an edge): the ruling is 60 a minute, so
    make the count a true 60 in any 60 seconds (sliding) with one statement and the same lock, and prove it with a test at
    the edge. If only the test is wrong (it mixes the test clock and the database's clock), make the limiter read the Clock
    port everywhere it reads time and fix the test. Do not loosen the assertion.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, the spec 40 times, `npm run test:affected --
src/modules/public-wishes src/modules/vault src/modules/wish-keeps` twice. Commit on p-flaky-reads; do not push; remove your
worktree and databases. Hand back in 8 lines: head; the cause with file:line; code or test; runs passed after the fix.
