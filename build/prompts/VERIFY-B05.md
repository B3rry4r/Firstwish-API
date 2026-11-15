VERIFIER B05 | TIER T2 full, money | Budget 100 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B05.md (the cases are the contract),
.pipeline/conventions.md (money), .pipeline/declared/payments.json and ledger.json (by python: rules), owner ruling R16.
Under test: local branch `b05-payments` (head d49579b) of /home/user/Firstwish-API; base local branch int-2 (bcd7632). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b05 (detached at the branch; `npm ci`); ports 4460-4469; database prefix vb05; remove both when done; kill by PID.
Endpoints: E-87, E-88, E-217 (`python3 tools/pipeline/show.py endpoint E-87`). The provider is the stand-in (never a real call).
Attack with your OWN scripts: the stack for the webhook over real HTTP (sign with the stand-in secret from the stack's env);
createTestApp where a signed-in user or the clock is needed. Register a throwaway fulfilment handler that counts its calls.
Known and NOT findings (rulings DD1-DD5 in build/rulings-phase3.md): paying needs sign-in; no payer list route yet; flags live in
the options JSON; the abandon job is exported, not scheduled (the jobs frame is on another branch); no real fulfilment handlers.
CLAIMS: each numbered line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b05/CLAIMS.md: PASS or FAIL with what you saw.
The money attacks (say what happened for each):
 - Double grant: for ONE payment send, all at the same moment, 10 webhooks + 10 verifies (run 10 times): the handler ran once,
   fulfilledAt set once, one sale journal, one paid event. Then a replay an hour later (clock port): nothing.
 - Forged money: a valid signature over a body with a smaller amount, another currency, another reference, status success for a
   payment that was abandoned, for one already succeeded, for one that belongs to another account. A webhook signed with the
   wrong secret, the secret as the body, an empty secret (does an EMPTY configured secret verify anything? boot must refuse it).
   Is the signature checked over the RAW bytes (change whitespace in the JSON: must fail)? Timing-safe compare?
 - The amount: can ANY client field change what is charged (amount, price, quantity 0, -1, 1.5, 1e9, a sku twice, an unknown sku,
   another ticket's extras, a version field)? At the promotion's end (clock): a payment started before and paid after keeps its
   started price; a start after the end is at list. The stored version equals the one quote() used.
 - Idempotency: 20 starts at once with one key: one row, one port call; the same key from another account: its own payment;
   a key reused after the first payment succeeded.
 - The ledger: for 30 random payments, each journal sums to zero, the sum of revenue + VAT equals the sum charged, VAT is exactly
   round(total x 0.075 / 1.075) on VAT-included lines and 0 elsewhere (check 5 by hand), no float in the module (grep), the fee
   journal never changes revenue. UPDATE, DELETE, TRUNCATE on ledger_entry refused. A rolled-back settle leaves no row.
 - Failure in the middle: the handler throws; the port's verify times out; the database drops between ledger and handler: the
   payment is never left "succeeded with nothing granted" or "granted with no ledger".
 - Reads: another account's reference is 404; nothing public; the webhook route gives no detail away on a bad signature.
 - Abandon: one second before and at 60 minutes; abandon running while the webhook settles the same payment (race, 10 times).
 - Errors: the envelope; no 500 except the ruled handler-failure case; no stack or SQL text.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/payments` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b05/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what was NOT RUN against the real provider; what else you did not run.
