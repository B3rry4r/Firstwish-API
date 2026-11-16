VERIFIER P-B19 re-check | TIER T2 (the payment start and a route that reads its own token) | Budget 40 steps. You did not build
this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings CA1, CA3, CB1-CB5 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b19/VERDICT.md and its spec /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b19/vb19.spec.ts.txt (reuse it).
Under test: local branch `p-b19` (head f27d33c) against `b19-concierge-cards-video` (fe5db16): `git diff` of the two is all you
check. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb19 (detached at p-b19; `npm ci`); ports 4870-4879; TEST_DB_PREFIX=vpb19; a clock in 2194;
remove both when done; kill by PID.
Check by id, each PASS or FAIL with what you saw:
 E-141 first (it is marked public and reads the bearer token itself): no token, a rubbish token, an expired token, a token
      signed with the wrong key, a refresh token, a banned or erased account's token, a staff token of a switched-off staff
      member, a staff role that is not maker or owner, a maker of another order, a user who does not own the wish: each
      refused with the registry's error shape, and nothing made. A valid user and the order's maker pass. Compare the code
      path with the kernel guard's checks line by line and list any check the route skips (HIGH if it skips one).
 CB1  20 starts at once on one order, three rounds: one payment row, one provider call, the same reference in every answer;
      after it settles a start is 409; a start after the pending payment FAILED makes a new one (not the dead one again);
      two different customers' orders at once do not block or mix.
 CA1  by hand: a single, a list of 12, a Pass holder's list of 3, a quoted order, at list and at 40% off: the payment equals
      the order's row and its lines sum to it; an amount, a price or a quote in the customer's body is 422 or ignored; the
      other payment kinds (a ticket, a plan, a pack) still price as before (run payments' own specs and one start of each).
 The payments edits: read every changed line of payments.service.ts, fulfilment.registry.ts and payment-request.ts: can any
      OTHER start check now set a price or return another account's pending payment (HIGH if so)?
 CB2, CB3, CA3: as the rulings say (one email per delivery, no receiver named; count "2" is 422; quote over 100 x list 422).
 Also: the first verdict's "held" list still holds (run the old spec; say what changed).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules/concierge
src/modules/qr-cards src/modules/render-jobs src/modules/payments src/modules/purchases src/modules/notices` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b19/VERDICT-P.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
