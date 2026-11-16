VERIFIER P-B16 re-check | TIER T2 money | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings ZZ1-ZZ4, ZZ6-ZZ8, WW5, WW8, GG6 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b16/VERDICT.md and its spec in the same folder (reuse it).
Under test: local branch `p-b16` (head f6b57ea) against `b16-creators-money` (8a6feeb): `git diff b16-creators-money p-b16` is all you
check. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb16 (detached at p-b16; `npm ci`); ports 4830-4839; TEST_DB_PREFIX=vpb16; a clock in 2190;
remove both when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-b16.
Check by id, each PASS or FAIL with what you saw (work each expected ledger by hand first; after every case every journal sums
to zero and waiting + paid + sending equals accruals less reversals):
 ZZ1  success, failed and reversed events with a float, a string, null, no amount, a negative, one kobo off: nothing changes
      and the payout is flagged; the right amount still works after.
 ZZ2  a claim left by a dead process is paid by a later month's run exactly once (20 runs at once); a payout sent 24 hours ago
      whose transfer did land is found and marked paid without a second transfer; one that never landed is failed and the
      balance returns once; one sent 23 hours ago is left alone; the lookup racing the provider's own event: paid once.
 ZZ3  a banned creator is not paid, a pending payout of theirs is not sent, and the next run after the ban is lifted pays the
      whole waiting balance once.
 ZZ4  a ticket payment by a person and by a business, with and without extras, at list and at 40% off: 20% of the premium
      style price in force, by hand.
 ZZ6  reverse then accrue (also 20 at once, both orders): nothing earned; the zero-kobo mark lines do not show in any sum or
      statement a creator or staff reads.
 ZZ7, ZZ8  E-114 during a send's lease is 409; after the lease, on a failed payout, a hand mark-paid posts one journal and one
      audit row; marking the same payout paid twice, or one already paid by an event, changes nothing (HIGH if it pays twice).
 WW5  one bank-changed email per change through the notices path, none on an unchanged resubmit; no full number in it.
 WW8  the Signed period ends once at its end (clock), not before; a standing second grant keeps it; run twice changes nothing.
 Also: the first verdict's "held" list still holds (run the old spec; say what changed), and the diff stays in royalties,
 payouts and the notices catalog, seed and spec lists.
Checks (quiet logs, EXIT lines): build, typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules/royalties
src/modules/payouts src/modules/payments src/modules/notices` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b16/VERDICT-P.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
