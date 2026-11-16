VERIFIER P-B08 re-check | TIER T2 money | Budget 35 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings TT1-TT6 and UU1 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b08/VERDICT.md and its spec /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b08/vb08.attack.spec.ts.txt (reuse it).
Under test: local branch `p-b08` (the head named in your spawn message) against `b08-refunds` (dfe9b20): `git diff b08-refunds p-b08`
is all you check. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb08 (detached at p-b08; `npm ci`); ports 4750-4759; TEST_DB_PREFIX=vpb08; a clock
in 2184; remove both when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-b08.
Check by id, each PASS or FAIL with what you saw (work each expected ledger by hand first):
 TT1  20 sends at once on one refund, three rounds: the provider stand-in is asked exactly once each round (count its calls),
      one reversal after the webhook; 20 sends at once across E-146 and E-86 together; a time-out whose ask did land, then a
      send again: one refund at the provider; a time-out whose ask did not land, then send again: one refund.
 UU1  a refund claimed with no answer: under 10 minutes a send is 409 and asks nothing; at 10 minutes or more it can be sent
      and creates at most one refund at the provider whether or not the first ask landed; 20 such sends at once: asked once.
      A refund that has a provider reference is never re-asked however old.
 TT2  support starts a refund and gets 403 on every other payments and refunds route; every other role is as the registry says.
 TT3  E-86: owner starts and sends; finance, ops and support (where the registry lets them call it) leave it waiting, and the
      same person's E-146 is then 403; a second person's E-146 sends it; nobody but the owner moves money alone by any route.
 TT4  the mismatch flag is gone after a good refund and stays after a bad amount.
 TT5  packs by hand: 10 + 5 bought, 6 used, refund the 5: 4 left; then refund the 10: 0 left and the kept row says what was
      used; 5 + 5, none used, refund one: 5 left; the left count never goes below zero and never goes up on a refund.
 TT6  a provider error on the settlement check is 502 in the envelope and writes no row.
 Also: the first verdict's "held" list still holds (run the old spec; say what changed), and the diff touches only
 src/modules/refunds, scripts/seed.mjs and the pack revoke in src/modules/purchases/business-handlers.ts.
Checks (quiet logs, EXIT lines): typecheck, gates.sh, `npm run test:affected -- src/modules/refunds src/modules/payments
src/modules/purchases src/modules/pro-business` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b08/VERDICT-P.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
