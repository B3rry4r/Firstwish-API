VERIFIER sweep | TIER T1 lean (the seed is the money part) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, ruling HE1 in build/rulings-phase3.md, the builder's table
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/sweep-api-table.md, and on the branch build/sweeps/api.md and build/sweeps/api-closed.md.
Under test: local branch `sweep-api` at f09696e of /home/user/Firstwish-API against 1efd82a. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-sweep (detached at
f09696e; `npm ci`); ports 5090-5099; TEST_DB_PREFIX=vsweep; a clock in 2209; remove both when done; kill by PID.
Check, each PASS or FAIL with what you saw:
 HE1  on a fresh database: seed; as staff (through the real admin routes) change the payout threshold, a price, a promotion's
      end and a message's wording; seed again twice: all four keep the staff values and their versions; a database with
      one of them deleted gets it back from the seed; the seed still creates everything on an empty database (compare row
      counts with the base branch's seed). The new test/kit/setting-lock.ts: is it test-only (nothing under src imports it)?
 The eight fixed lines: for each, the finding as its line states it no longer reproduces, and the test named for it fails
      when you undo the fix in a scratch copy (do this for three of them, the money or access ones first).
 The tests that were shaky: read each changed test: is any assertion weaker than before (a retry that hides a real refusal, a
      wider accepted set, a count that became "at least")? The vault test now sends a confirm again when it was neither 200
      nor refused: can that hide a real over-limit (the stored bytes must still be checked against the limit: say)? The
      staff-accounts teardown retry and U1's wait: fine or not, one line each.
 The 20 "already fixed" and 9 "not a defect" lines: check five of each against the code (file:line); name any that is still
      a defect.
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, check-routes, check-drift, seed twice on a fresh
database, `npm test` (--maxWorkers=2) twice (name any failing test).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/sweep/VERDICT.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
