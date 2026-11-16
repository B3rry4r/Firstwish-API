PATCH P-API-BASE-4 | TIER T2 money | Budget 35 steps. The verifier's named findings only; a small diff the lead reads.
Read /home/user/Firstwish-API/build/common-rules.md, ruling HP12 in build/rulings-phase3.md, and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab4/VERDICT.md (its probe specs are beside it: reproduce finding M1 FIRST as a failing test).
Work: commit on local branch `api-base-4` (f2cdfa6) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab4 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab4 api-base-4`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab4.
 M1 (medium) src/modules/payouts/admin-creators.service.ts addPayoutMonths: `due` must follow how payouts are really
    made (payout-run.service.ts makeFor pays the running balance): a month whose earnings a later succeeded payout
    covered is NOT due; a month held under the threshold is due only as the run would count it (say the rule in one
    line in the code and in your hand-back). The verifier's case: 2026-10 (85000) and 2026-11 (30000) stayed due after
    a 615000 payout for 2026-12 succeeded. Tests: that case; a balance under the threshold; a failed payout; a
    creator paid in full: no month due and the amounts equal the ledger.
 L1 PATCH /v1/wishes/:id with occasion null: 422 on the field (or the contract's meaning of null if it has one: say
    which), never 500. L2 a kind-only change that leaves an occasion the new kind lacks: 422 naming occasion (the
    person must send both), so a draft can never hold a pair the server would refuse.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-routes, the affected
specs, `npm test -- --maxWorkers=2` once. Commit on api-base-4; do not push; remove your worktree and databases; leave
no background jobs. Hand back ONCE in 6 lines: head; M1, L1, L2 closed or not with file:line and the test's name; totals;
`git diff --stat` against f2cdfa6.
