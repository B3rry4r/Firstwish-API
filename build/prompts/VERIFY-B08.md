VERIFIER B08 | TIER T2 full, money | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B08.md (the cases are the contract),
rulings PP1-PP6 in build/rulings-phase3.md.
Under test: local branch `b08-refunds` (head dfe9b20) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b08 (detached at the branch; `npm ci`); ports 4750-4759; TEST_DB_PREFIX=vb08 for every run; a clock in the year 2181 for
your own cases; remove both when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-b08-refunds.
Known and NOT findings (PP1-PP6): the refund port is its own port; E-84 q/flag and E-63 day are not in the registry yet; no
Refund.note column; no automatic refund on a failed delivery; the Paystack adapter never ran against Paystack. A FINDING if
true: support cannot start a refund (PP5) - report it as medium with the seed file:line.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b08/CLAIMS.md: PASS or FAIL with what you saw.
Attacks (money; work each expected ledger by hand first):
 - Twice: 20 starts at once on one payment; 20 sends at once on one refund (the provider stand-in must be asked once per key,
   count its calls); the processed webhook 20 times at once and again after; start, send, time-out, send again, then the
   webhook: one reversal only. After every case: sum of every journal is zero and the account's balance equals the hand sum.
 - Forged and odd webhooks: a bad signature; a refund event for another payment's reference; an amount of 0, negative, larger
   than the payment, a float, a string; a processed event for a refund that was never started (must not move money); a
   processed event after a failed one; an event for a refund in `requested` (not yet sent).
 - Two people: the same staff member starts and sends through E-146 (403); through E-86 with a second session; a finance
   member whose role is removed between start and send; every staff role on every route against the registry.
 - What the money bought: refund a payment whose ticket sealed a wish (ticket kept, refund.kept), one whose ticket is unused
   (ticket gone, wish cannot seal), a Pro plan month, a pack partly used, a Vault size in use: say what is left and whether a
   user can still spend what was refunded (HIGH if yes).
 - Erased payer: refund a payment of an erased account: no 500, the money rows stay, no personal data comes back.
 - Settlement: a day with ours-only, provider-only and differing amounts worked by hand; a day run twice with a changed
   provider answer; 5 runs at once; today and tomorrow (422); a provider time-out (no row or an honest one, never "matched").
 - Reads: ?q= with %, _, a quote, a NUL byte, 5,000 characters; a non-uuid id; a bad cursor: no 500; no full email anywhere.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/refunds src/modules/payments src/modules/purchases` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b08/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
