VERIFIER API-BASE-18 | TIER T2 (a money path), short | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-18/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/API-BASE-18.md (its cases are the contract) and /home/user/Firstwish-API/build/tasks/TX-POOL-AUDIT.md.
Under test: /home/user/Firstwish-API local branch `api-base-18` (head b398b84) against its base f342618. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab18 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=vab18.
The builder's claims: before, twenty Concierge order starts at once for one account on a pool of 3 gave 2 x 201 and
18 x 503; after the fix (BusinessOf.find takes an optional client; concierge.service.ts passes `tx`) 20 rounds gave
400 x 201, 0 x 503, exactly 400 orders, 0 payments; new pool tests for settle (the same event x20; twenty payments of
one account), seal (one 200, nineteen 409) and refund (one start, one approval, one provider call; ledger equals the
provider) pass 20 rounds each on a small pool, in their own databases; specs
src/modules/concierge/tests/ab18-order-start-pool.spec.ts and src/modules/payments/tests/ab18-money-pool.spec.ts; full run 1605 passed.
Check (each PASS or FAIL with numbers):
 1. Are the tests honest? Each really runs on a small pool (read how the limit is set and prove it took effect: the
    pool size the client reports, or a 21st connection waiting), in its own database, with twenty requests truly at
    once (not one after another: show the overlap), and asserts the money and the rows, not only the status codes.
 2. Would each test catch the fault? Put a pool read back inside the transaction in YOUR worktree only (revert the
    2-line fix for Concierge; for settle, seal and refund add one `this.prisma` read after the row lock): each
    test must fail with 503s. A test that still passes proves nothing: a finding.
 3. Twenty Concierge order starts at once all answering 201: is that right? Should one account be able to open
    twenty orders at once (what do the rulings and the contract say about open orders per account)? Report only.
 4. Every other caller of BusinessOf.find still reads as before (list them); typecheck; the WHOLE lint; gates.sh;
    check-contracts, check-drift, check-routes; the two new specs 5 times: 0 failed.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-18/VERDICT.md (25 lines or fewer): MERGE or FIX FIRST, findings by
severity with file:line. Drop your databases, remove your worktree. Hand back ONCE in 10 lines.
