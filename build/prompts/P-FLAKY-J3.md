PATCH flaky test (CI) | TIER T1 | Budget 35 steps. One test fails some of the time in CI. Find why; fix the cause.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md (the rule on specs sharing one database), rulings SS1, QQ4
in build/rulings-phase3.md.
The fact: CI run 43789330952 (the wave 4 code) failed once in src/modules/showing/tests/join4-showing.spec.ts, test "J3: a
resting wish that comes back is live and not listed; it needs a new ask and a new approval": `expect(again.status).toBe(201)`
at line 89 received 409. It passed in other runs. Totals: 1 failed, 754 passed.
Work: local branch `p-flaky-j3` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flaky-j3 (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; ports 4930-4939;
TEST_DB_PREFIX=pflaky. Stay inside src/modules/showing, src/modules/wishes (the lifecycle only) and their tests.
 1. Reproduce: run that spec 30 times alone and 5 times inside `npm run test:affected -- src/modules src/common test`; say how
    often it fails and under what condition (another spec's rows, a job, a clock, an ask left behind).
 2. Decide by evidence whether the CODE is wrong (a path by which a wish rests or wakes without its listing and ask being
    dropped in the same transaction, or a re-ask refused when it should pass) or the TEST is wrong (it reads another spec's
    rows, shares a clock or an address, or runs jobs without `only`). A 409 on a real re-ask after a wake is a product
    defect: if the code is wrong, fix the code and add a test that fails before and passes after. If the test is wrong, fix
    the test without weakening what it asserts.
 3. If you cannot reproduce in 60 runs, say so, give the most likely cause from reading the code (file:line), and make the
    test independent of other specs' rows anyway.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, the spec 30 times, `npm run test:affected --
src/modules/showing src/modules/wishes src/modules/moderation` twice. Commit on p-flaky-j3; do not push; remove your worktree and
databases. Hand back in 8 lines: head; the cause with file:line; code or test; how many runs passed after the fix.
