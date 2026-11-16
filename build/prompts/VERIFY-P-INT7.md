VERIFIER P-INT7 re-check | TIER T2 money | Budget 35 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HF1-HF3, HD2 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int7/VERDICT.md and its probe specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int7/vint7-spec/ (reuse them).
Under test: local branch `int-7` at 9df0b93 against 68b989e: the diff of the two is all you check. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pint7 (detached at 9df0b93; `npm ci`); ports 5170-5179; TEST_DB_PREFIX=vpint7; a clock in 2211; your own addresses
and your own Numbers line; remove both when done; kill by PID.
Check by id, each PASS or FAIL with what you saw (counts by hand first; rows through the real routes):
 HF1  your first finding: pack of 5 paid, 2 drafts drawn and removed, the pack refunded, the window ends: pack 0 and the next
      client wish is 402. Then every order of {remove, window ends, refund's event, restore, a second pack bought, the plan
      month rolling, the plan refunded}: 200 random orders on one business: after EVERY step, wishes that can still be made
      (month left + pack) never exceed what is paid for and not yet used (your own function from the rows), never below
      zero; no wish is ever made free; a give-back is recorded at most once per record. A draw with no source recorded (a
      record from before the migration): what it gives back and to where: can THAT be used to get a wish back onto a
      refunded pack (HIGH if yes)?
 HF2  pack of 5, one draw given back, 5 more draws: each has its payment and earns once; two packs: the right pack each time.
 HF3  the over-plan notice: one per state, none on a second payment in the same state, one again after the logins were
      brought in line and a later downgrade; the stand-in refund lookup by amount; a Numbers target with no staff row: 403.
 Also: the first verdict's PASS list still holds (run your probe specs; say what changed); the test edits in
 registry-reopen.spec and staff-reads.spec loosen nothing.
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, check-drift, check-routes, `npm test` (--maxWorkers=2) once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int7/VERDICT-P.md (20 lines or fewer). Hand back in 10 lines or fewer: merge or fix; findings by severity with file:line.
