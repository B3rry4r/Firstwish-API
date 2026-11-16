PATCH P-API-BASE-6b | TIER T2 money | Budget 45 steps. The second check's findings; a small diff the lead reads; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HU3, HU4, HU5 in build/rulings-phase3.md, and the second verifier's probes and
outputs in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab6/round2/ (money.out shows the deadlock; its spec reproduces it: run it FIRST and see
40P01 on this head).
Work: commit on local branch `api-base-6` (711e8d3) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab6b (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab6b api-base-6`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab6b. Run every command
with your own worktree as the working directory.
 F1 (blocks the merge) scripts/gates.sh exits 0: the gate "no deferral phrasing in src" matches "belongs to" in three
    new comments (wish-keeps.service.ts:239, payments.service.ts:97, wishes/house.ts:11): reword the comments to say
    what the code does (do not touch the gate).
 F2 (medium, money) The owner's and a link holder's payments for one wish settling at the same moment deadlock
    (Postgres 40P01 in 6 of 30; one settle fails and waits for the provider's retry): the holder path locks the wish
    row first, the owner path the account then the wish (wish-handlers.ts near line 100). Make every settle path
    take its locks in ONE order (say the order in a comment at the one place that defines it), and let a settle that
    still meets 40P01 or a serialization failure run again once inside the settle call. Test: 30 pairs of owner and
    holder settles at once, five times over: 0 errors, the wish kept once per pair, one payment fulfilled and one
    refund due, the ledger balanced; the same for two holders; the older settle tests still pass.
 F3 (low) A removed login gets login_removed on PATCH /v1/business and GET /v1/ticket-offers as on the other
    business routes (the guard runs before the body check); the wish's owner can add their own voice when friends'
    voices fill the 12 (HU4: the owner's own voice is not counted against what friends may send: say the new bound
    in words: 12 from friends and the owner's own).
Checks (quiet logs, EXIT lines): typecheck, eslint on the changed files, gates.sh (EXIT 0), check-contracts,
check-routes, the affected specs, `npm test -- --maxWorkers=2` once with 0 failed. Commit on api-base-6; do not push;
remove your worktree and databases; wait for your runs and leave no background jobs. Hand back ONCE in 6 lines: head;
F1-F3 closed or not with file:line and the test's name; totals; `git diff --stat` against 711e8d3.
