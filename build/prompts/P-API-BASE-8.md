PATCH P-API-BASE-8 | TIER T2 money and identity | Budget 80 steps. The check's findings; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HZ1-HZ4, HY1-HY4, HU6, HR1 in build/rulings-phase3.md, and the verifier's probes
in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab8/ (run the ones for the two HIGH findings and the double-plan path FIRST: they show the faults
on this head).
Work: commit on local branch `api-base-8` (9649ee5) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab8 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab8 api-base-8`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab8. Run every command
with your own worktree as the working directory; one jest run at a time. If the registry must change, ONE reopen as
API-BASE-8 did; ids already issued never change. No deferral phrasing in src comments.
 F1 (high, HZ1) Search: src/modules/support/support.service.ts `list` and src/modules/concierge/concierge.service.ts
    `matching`: an insensitive `equals` runs as ILIKE, so `%` and `_` in q are wildcards and a masked email or a
    wish number can be rebuilt one character at a time. Email and wish number: exact whole-value comparison
    (lower(x) = lower($1)); name, subject and the other contains-fields: the three characters escaped. Tests: for a
    support member with a masked contact, every wildcard form (%@host, prefix%, _ per letter, a wish-number prefix
    with % and _) finds nothing; the exact address still finds the thread and returns the mask; the same on
    Concierge.
 F2 (high, HZ2) src/modules/concierge/concierge.service.ts `staffWishes` (E-270): the read lists only the wishes
    delivered under this order; nothing of the buyer's other wishes in any state (a buyer with none delivered: an
    empty list); the registry words for E-270 and DEC-258 say so. Tests: a buyer with wishes made alone and a
    business buyer with client wishes: the maker sees none of them before delivery.
 F3 (medium, money, HZ3) src/modules/pro-business/plan-drop.ts and src/modules/payments/settlement.service.ts:~152:
    drop A, start B, A reported paid (fulfilled), then B paid: today both are fulfilled (two invoices, renews two
    months out). At settle, a plan payment is refund due when another plan payment of the business was fulfilled
    after this one was started; one plan applied, one invoice, the other's read says refund due with words; the
    same after a lapse instead of a drop; paying again after the first was fulfilled still adds a month. Test each
    order of A and B settling, and both at the same moment (30 pairs: one fulfilled, one refund due, the ledger
    balanced).
 F4 (low, HZ4) A plan-payment start naming the pack is 422 with words; the registry records the response shapes of
    E-269, E-270, E-271 and `lapsesAt` on the plan read's pending (today response null / missing).
 F5 (suite) src/modules/pro-business/pro-business.spec.ts asserts gap-free invoice numbers in a month other specs
    also invoice in (lines ~237, ~297): give that spec a month no other spec uses (its NOW at line ~13), then put
    the two new api-base-8 specs back on ordinary dates. zb3-plan-wishes.spec.ts test 8 failed once in three full
    runs (422 on create wish draft) and passed alone: find what shared row it depends on and make the spec own
    it, or report exactly what you saw if it does not reproduce in five runs of that file beside its neighbours.
Checks (quiet logs, EXIT lines): typecheck, eslint on the changed files, gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test` (CI's command) THREE times in a row with 0
failed. Commit on api-base-8; do not push; remove your worktree and databases; leave no background jobs. Hand back
ONCE in 9 lines: head; F1-F5 closed or not with file:line and the test's name; new ids; the three run totals;
`git diff --stat` against 9649ee5.
