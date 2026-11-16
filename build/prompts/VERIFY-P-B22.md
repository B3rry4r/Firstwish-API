VERIFIER P-B22 re-check | TIER T2 money | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HB1, HB2, HB3, HA2, HH4, EE7, EE8 in build/rulings-phase3.md, the first
verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b22/VERDICT.md and its two specs in the same folder (reuse them: the builder did NOT run them).
Under test: local branch `b22-keep-wake-pass` at 8970fc3 against bc0c3fb: the diff of the two is all you check. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb22 (detached at 8970fc3; `npm ci`); ports 5040-5049; TEST_DB_PREFIX=vpb22; a clock in 2205; remove both
when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-b22-keep-wake-pass.
Known and NOT findings (HB3): a Pass bought before a wish is first opened is applied at the next keep, wake or Pass event,
not at the open (the join fixes it).
Check, each PASS or FAIL with what you saw (work every expected end by hand first, from the rows, with your own small
function written from the ruling's words, not copied from the code):
 HB1  your two first-verdict cases; then 300 random orders of events of your own (three keep lengths paid and refunded in any
      order, by owner and by a receiver; a Pass bought, refunded, a second Pass; time passing across the own term, a keep's
      end and the Pass's end; wake; a wedding wish): after EVERY event the stored end equals your function's answer, keptBy
      is right, the rest job is scheduled exactly at the end (or absent for a resting wish), and the end is never later than
      what is paid for or covered. Report the first counter-example in full if one exists.
      Money stays right: refunds give back exactly the keep's own payment; every journal sums to zero.
 The fixtures the builder changed in other specs (purchases.spec, purchases.patch.spec, join4.spec, wish-keeps.contract.spec):
      does each test still assert what its ruling says (read the diff of each; a weakened assertion is a finding)?
 HB2  E-83 with two stacked Passes; a refund on a resting wish leaves no rest job.
 Also: the first verdict's "passed" list still holds (run both old specs; say what changed).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules/wish-keeps
src/modules/me-pass src/modules/purchases src/modules/wishes src/modules/public-wishes src/modules/payments
src/modules/refunds` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b22/VERDICT-P.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
