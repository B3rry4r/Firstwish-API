BUILDER API-BASE-18 | TIER T2 (a money path: Concierge order start; and pool tests for settle, seal, refund) | Budget 110 steps. Two tasks, nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; a commit at every closed case; never
pkill, killall or pgrep -f (stop only PIDs you started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/tasks/TX-POOL-AUDIT.md (the whole file: it is short), the P-CI-6 fix
(src/modules/support/support.service.ts assign, role-access.service.ts) and the pattern spec
src/modules/payments/tests/api-base-9-pool.spec.ts (many at once on a small pool, its own database: test/kit/own-db.ts).
Work: /home/user/Firstwish-API, local branch `api-base-18` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-18 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=ab18. Do not edit a gate or a
baseline; change no older test's expectation; no registry change (no wire field changes).
Task 1 (B1, the one finding): src/modules/concierge/concierge.service.ts:124-130: the order start locks the account row, then
`this.businesses.find(accountId)` reads the POOL (src/modules/people/business-of.ts:19). FIRST write the failing test: twenty
order starts at once for ONE account on a small pool (the pool spec's way), every one must answer 201 or its proper
refusal, none 503, and no extra order or charge is made; show it failing (or say plainly that it does not fail and
why). Then the fix: `find` takes an optional client (default the pool, as today) and the order start passes `tx`;
every other caller of `find` unchanged. Show the test passing 20 rounds.
Task 2 (B2, test only): the same kind of test for three money paths the audit read as clean, to prove it by running:
payment settle by webhook (twenty of the SAME event at once, and twenty different payments of one account), wish
seal (twenty at once on one paid wish: one seals, the rest get the proper refusal), refund (twenty at once on one
payment: one refund, the ledger equals the provider stand-in). Each: a small pool, its own database, every request
answers, none 503, the money and the rows are right after. If one of them FAILS, that is a finding: stop, do not
loosen it, fix it only if the fix is passing `tx` (30 lines or fewer); otherwise hand it back as open.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; your new
specs 20 rounds each: 0 failed; the concierge, payments, refunds and wishes folders' specs once; then
`WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0 failed. Commit on api-base-18; do not push; remove your
worktree. Hand back ONCE in 10 lines: head; Task 1 before and after (counts of 201, refusals, 503); each Task 2 path's
counts; any finding; the full run's totals; what was NOT run.
