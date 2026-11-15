VERIFIER P-B05 | TIER T2 money, re-check by ruling id | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B05.md, rulings FF1-FF6 and DD1-DD5 in build/rulings-phase3.md,
and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b05/VERDICT.md (round 1).
Under test: local branch `p-b05` (head 980ebe5) of /home/user/Firstwish-API; base local branch int-3 (c4fef88). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b05 (detached at the branch; `npm ci`); ports 4530-4539; TEST_DB_PREFIX=vpb05 for every run; remove both when done; kill by PID.
With your OWN scripts (the stack for the webhook over real HTTP; createTestApp where a signed-in user, the clock or a stand-in
that never answers is needed), say CLOSED or OPEN for each, with what you saw:
 FF1: with a provider stand-in that never answers, GET /v1/payments/:reference answers within the limit with the payment still
      pending, no ledger row, no paid event, no grant; a later real success still settles it once. A start that times out: what
      does the payer get, and is a payment row left that could be paid later by a late provider callback? (a row that can be
      settled after the payer was told it failed is a finding: say what happens to a late success for it).
 FF2: a validly signed event with a NUL in its id or reference is 400 and nothing is stored.
 FF3: two validly signed events with one transaction id and two references are both stored and both settle their own payment.
 FF4: the same idempotency key after success: 200, the payment as it stands, no checkout address, no second row or port call.
 FF5: 59:59 pending, 60:00 abandoned.
 DD2: GET /v1/payments shows only the caller's own, newest first, pages without repeats; another account's never appears.
 DD3: flags are in payment.flags and webhook_event.outcome; nothing in the options JSON.
 DD4: another account's reference is 404; purpose upgrade is 422.
The money, again: 10 webhooks + 10 verifies at once on one payment, 10 rounds: handler once, one sale journal, one paid event;
a forged smaller amount, another currency, a wrong signature, changed whitespace: never fulfilled; 30 random payments balance
and revenue + VAT = charged; UPDATE and DELETE on ledger_entry refused; the abandon job run by the tick abandons only payments
60 minutes or older; abandon racing a settle 10 times ends succeeded with the handler run once.
Also: the diff touches only src/modules/payments (`git diff --stat int-3...p-b05`); anything NEW that is high or blocker.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/payments src/modules/job-handlers` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b05/VERDICT-P.md (30 lines or fewer). Hand back in 12 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what was NOT RUN against the real provider.
