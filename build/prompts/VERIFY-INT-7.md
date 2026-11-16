VERIFIER INT-7 | TIER T2 | Budget 65 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-7.md (its four steps are the contract),
the lines of build/sweeps/api.md as they stood at bb11d7a (`git show bb11d7a:build/sweeps/api.md`), and rulings HD2, ZB3, ZB4,
TT1, FC2 in build/rulings-phase3.md.
Under test: local branch `int-7` at 68b989e of /home/user/Firstwish-API against bb11d7a. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-int7 (detached at
68b989e; `npm ci`); ports 5170-5179; TEST_DB_PREFIX=vint7; a clock in 2210; your own addresses; remove both when done; kill by PID.
Check, each PASS or FAIL with what you saw (rows through the real routes; counts by hand first):
 - The give-back (the money part): a business with 3 month + 2 pack wishes draws 5 draft client wishes (sheet, date), then
   removes them: at the end of each restore window (move the clock; run the due jobs with `only`) the month count and the
   pack are what they were, by hand; a draft drawn LAST month and removed this month gives nothing back to this month (and
   says what happens to the rolled count); a pack wish returns to the pack even after the plan lapsed; a restored draft
   (within the window) gives nothing back and keeps its draw; restore then remove again: one give-back at most; a SEALED
   client wish removed: nothing back; an erase of the owner: each unsealed draft gives back once; 30 removals, restores and
   window jobs at once on 5 drafts: never more given back than drawn, counts never below zero or above the plan; a refund of
   the plan or pack payment before and after a give-back: no wish is given back to a revoked pack, the books still balance
   and the royalty rows are right (a draft never earned).
 - Can it mint wishes? A draft made by the maker with a ticket (not a client wish), a Pass wish, another business's draft,
   a draft whose record has no draw source (made before the migration): none gives a plan wish to anyone.
 - The account-delete trigger: every erase path still works (person, business owner, login, creator with money rows); no
   code path deletes an account row (grep) and the full suite passes; the test database teardown still works.
 - NumbersTarget.setBy: a target needs a real staff member; erasing or removing that staff member later does what the erase
   rules say (no 500).
 - Login.overPlan and the logins-over notice: Studio to Starter with 3 logins: one email to the owner, the flag on the right
   logins, nobody locked out; a second downgrade event sends no second email for the same state.
 - findRefund matches the amount: the stand-in with two refunds on one transaction of different amounts returns the right
   one; none matching returns none (and the send then creates one: say whether that can double refund).
 - The audit clock: audit rows' times follow the Clock port; the append-only rule on audit rows still holds.
 - The registry: one reopen; only Login changed; ids unchanged; check-contracts, check-routes, check-drift pass with empty
   baselines; no gate weaker (`git diff bb11d7a int-7 -- scripts/ tools/pipeline/ .github/ build/baselines/`).
 - P2028 mapped to 503 in the error filter: which requests can now answer 503, and does any write that answered 503 leave a
   half-done change (try the Vault confirm under load)?
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, check-drift, check-routes, seed twice,
`npm test` (--maxWorkers=2) twice (name any failing test).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int7/VERDICT.md (35 lines or fewer). Hand back in 18 lines or fewer: merge or fix; findings by severity with file:line.
