PATCH flaky test | TIER T1 | Budget 30 steps. One test failed once in CI. Find why; fix the cause, not the symptom.
Read /home/user/Firstwish-API/build/common-rules.md and build/prompts/P5-COMMON.md (specs share one database; each owns its fixtures).
The fact: CI run 198 (a commit that changed only build/ notes) failed 1 of 1153 in src/modules/styles/tests/
styles.contract.spec.ts, "E-198 GET /v1/styles/levels (case 1) > is public and cacheable with an ETag that answers 304
while nothing moved": the second GET with If-None-Match answered 200 where 304 was expected (line 82). The run before
and the full runs on this machine pass. Suspected: another spec (in another jest worker, same database) writes a style
or a level between the two GETs, so the ETag honestly changed.
Work: local branch `p-flaky-etag` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flaky-etag (`npm ci`, prisma generate); never commit on claude/sleepy-mayer-f0hkb8 itself; TEST_DB_PREFIX=pfetag.
 1. Say in one line what the ETag of /v1/styles/levels is made from (read the code) and name every spec that writes what
    it is made from (grep), so the cause is shown, not guessed.
 2. Reproduce: a deterministic case (write a level between the two GETs: 200) and, if you can, the race (the spec 30
    times beside the writing spec with 2 workers).
 3. Fix the TEST so it proves the same thing without depending on other specs: the 304 must be shown for an ETag the
    server still holds (for example: read, replay; if the answer is 200 with a DIFFERENT etag the data moved under the
    test, so replay that new etag; fail if the same etag ever answers 200, and fail after 5 moves). The route's code
    changes only if step 1 shows the ETag itself is wrong (for example it holds a clock): then say so and fix that.
    Do not serialise the whole suite, do not skip or loosen the 304 claim, do not edit another spec.
Checks (quiet logs, EXIT lines): typecheck, lint on the changed file, the styles specs 20 times with --maxWorkers=2
beside the writing spec(s), gates.sh. Commit on p-flaky-etag; do not push; remove your worktree and databases. Hand back
in 6 lines: the head, the cause (file:line), what changed, the run counts.
