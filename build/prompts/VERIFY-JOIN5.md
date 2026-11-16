VERIFIER wave 5 join | TIER T2, money joins | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/WAVE5-JOIN.md (J0 to J9 are the contract), and in
build/rulings-phase3.md: WW1, WW2, YY4, CA3, ZZ4, ZZ6, ZZ8, CB5, SA6.
Under test: local branch `p-join5` at 9e13fa6 of /home/user/Firstwish-API. What the join itself wrote is the commits after its last
merge commit (`git log --oneline --first-parent 8f32d91..9e13fa6`; diff from the last merge commit to 9e13fa6). Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-join5 (detached at 9e13fa6; `npm ci`); ports 4910-4919; TEST_DB_PREFIX=vjoin5; a clock in 2196; remove both
when done; kill by PID. `node scripts/check-drift.mjs` fails here by design (seven raw-SQL tables the lead will baseline).
Check, each PASS or FAIL with what you saw (work every expected ledger by hand first; after every case every journal sums to
zero and each account's balance equals your hand sum):
 J2  end to end through the real routes and the signed webhook: a person pays for a wish in a creator's Premium style, at list
     and at 40% off, with an extra in the same payment: one accrual of 20% of the premium style price; then the refund's
     event: one reversal, the creator's balance back to zero, Firstwish's and the provider's accounts by hand. The join made
     the refund's ledger reversal skip rows whose memo starts "Royalty" (ledger-reversal.ts): show that the royalty is taken
     back exactly once (not twice, not zero times), also when the refund comes BEFORE the accrual could run, and for a
     template style (two creators). Can any row that is not a royalty have a memo starting "Royalty" (search the code)? The
     builder saw `reversedFirst` query account 'royalties-payable' while the mark is written under royalties_payable
     (royalties.service.ts): is that a live bug (reverse first, then accrue through the real settle: does it earn)?
 J1  a signed transfer.success pays a payout once; replay, bad signature, wrong amount change nothing; transfer.failed returns
     the balance once; a refund event and a transfer event in the same second do not cross.
 J4  the Signed grant's endsAt is set at fulfil and the period ends once; a payout marked paid by hand ignores later failed,
     reversed and success events (no money moves, one staff flag); a payout NOT marked by hand still follows events.
 J3  refund_due is set once by Support's bounce, Concierge's cancel and a refused grant, only on payments that took money.
 J5  a business's Concierge order and a creator plan paid by a business account leave one invoice each with the right VAT
     part; a person's leave none; numbers stay in order with the plan and pack invoices under 20 settles at once.
 J8, J9 as the brief says.
 The two tests that failed once each for the builder: run `jobs.spec` "the BullMQ tick runs due jobs from the queue" and
     moderation.contract "10 reports a day per address" 15 times each while the full suite runs beside them; if either fails,
     find the cause (file:line) and say whether the code or the test is wrong (a limiter that lets 9 of 10 in is a finding).
 The tests the join edited (payments.rulings, refunds.contract, studio.patch SA5): does each still test what its ruling says?
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules src/common test`
twice (name any failing test).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/join5/VERDICT.md (30 lines or fewer). Hand back in 15 lines or fewer: merge or fix; findings by severity with file:line.
