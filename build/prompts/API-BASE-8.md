BUILDER API-BASE-8 | TIER T2 | Budget 160 steps. What the Plan screen and the staff Support and Concierge screens still need from the server; change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HY1-HY5, HR1, HU6 in build/rulings-phase3.md, the list build/sweeps/api.md (the
section "For API-BASE-8" and the API-BASE-8 rows below it) and how API-BASE-7 reopened the registry (build/prompts/
API-BASE-7.md). ONE reopen for all registry changes here, decisions citing the ruling ids, reconcile twice identical,
freeze; ids already issued never change; `.pipeline/ui-align-tasks.json` must come out byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-8` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-8 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab8. Run every command with your
own worktree as the working directory; never commit on claude/sleepy-mayer-f0hkb8 itself. Do not edit a gate or a
baseline; an older test changes only where a ruling makes its expectation wrong (name each line and why). A test
makes its own rows and counts only its own (the suite shares one database across workers: CI runs `npm test` with
its default workers). No deferral phrasing in src comments.
Cases (through the real routes; a test for each; in this order; wait for your own runs before you hand back):
 1. HY1 (money): the plan read's `pending` carries when the payment lapses; everyone who may pay for the business's
    plan (the owner, and a login where the contract lets a login pay) reads that payment's result by its reference
    (today the owner gets 404 for a login's); the OWNER drops a pending plan payment at once (abandoned; audited
    as the business's act), after which a new start is allowed; a late "paid" for the dropped one follows HU6
    (fulfilled only if nothing else has paid for a plan since, else refund due); a login cannot drop the owner's;
    another business's: 404. Attacks: drop and settle at the same moment (30 pairs: one outcome, the ledger
    balanced, never two live plans or a lost payment); drop twice; drop a settled one (409 with words).
 2. HY2: `q` on the staff Support list and the Concierge list (the fields the ruling names), with paging and the
    existing filters; a moderator's or support member's masked fields stay masked in results and cannot be probed
    by search (a search by full email finds the thread but returns the mask).
 3. HY3: the short staff list for a hand-over, for the roles that may hand over; removed staff are not on it.
 4. HY4: the Concierge order read carries paymentId and the provider reference for the roles that may read
    payments; others get neither field.
 5. HY5: the maker's read of an order's wishes: only that order's; another maker, another order: 404.
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, scripts/gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `npm test` (CI's own command) twice in a row with 0 failed. Commit on
api-base-8; do not push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 10 lines:
head; each case closed or not with the test's name; new endpoint and decision ids; totals; what you could not do.
