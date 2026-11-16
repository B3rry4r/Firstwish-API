VERIFIER B16 | TIER T2 full, money | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B16.md (the cases are the contract),
rulings WW1-WW8 and R14 in build/rulings-phase3.md and build/rulings.md.
Under test: local branch `b16-creators-money` (head 8a6feeb) of /home/user/Firstwish-API; base: local branch int-4 at e866a5c.
Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b16 (detached at the branch; `npm ci`); ports 4830-4839; TEST_DB_PREFIX=vb16 for every run; a clock
in 2186 for your own cases; remove both when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-b16-creators-money.
Known and NOT findings (WW1-WW8): nothing calls accrue or reverse yet (call them yourself in a transaction as the builder's
spec does); the webhook does not pass transfer events (call the sink's apply); the payout port is its own port; two raw-SQL
tables; the bank-change notice goes straight through the email port; no Signed-period job; Paystack never run.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b16/CLAIMS.md: PASS or FAIL with what you saw.
Attacks (money; work every expected figure and ledger by hand first):
 - Shares: ten payments with awkward amounts (1, 3, 7, 99, 80001 kobo and real prices): creator share + template share +
   Firstwish's rest equals the royalty base exactly; no kobo made or lost; the price in force is the payment's own (change the
   price book and the promotion after the payment: the accrual does not move); a business wish paid from a plan and from a pack.
 - Twice: 20 accrues at once for one payment; accrue, reverse, accrue again; reverse twice at once; reverse before any accrue.
 - The run: 20 runs at once for one month (count provider asks per payout); a run for this month and a future month (refused);
   a balance exactly at the threshold, one kobo under, negative; the threshold changed between two runs; a creator with no
   bank account, one erased, one banned; a bank account changed while the payout is being sent (which account is paid: say);
   a time-out then the run again (asked again or not: say; never two transfers); a process that dies after the claim (does
   the payout ever get out of sent: HIGH if stuck for good).
 - Events: transfer.success twice, then failed; failed then success; success for an unknown payout, for another creator's
   payout, with a wrong amount, a float, a string; 20 at once: one payment in the ledger, balance by hand.
 - After every case: every journal sums to zero; the creator's waiting + paid + sending equals accruals less reversals.
 - Bank: another creator's bank is never read or changed; the full number is in no answer, log line or audit row; a non-digit
   number, 9 and 11 digits, a NUL byte, an unknown bank: 422.
 - Staff: every staff role on every staff route against the registry; a reason missing is 422; one audit row each; a staff
   read shows no full bank number or email.
 - Erase: erase a creator with a waiting balance, with a payout being sent, with a negative balance: no 500, money rows stay,
   no personal data stays, nothing is ever paid to them.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/royalties src/modules/payouts src/modules/payments` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b16/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
