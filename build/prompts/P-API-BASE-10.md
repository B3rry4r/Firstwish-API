PATCH P-API-BASE-10 | TIER T2 | Budget 70 steps. Findings from the check of the tenth API round; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs; a commit on the branch at every closed finding. Stop only PIDs you started. If the worktree or commits of
this patch already exist, an earlier agent was lost: read git log and carry on.
Read /home/user/Firstwish-API/build/common-rules.md, rulings IE1, IE2, IE3 (and ID1, IC7, IC4, T-13) in build/rulings-phase3.md, and the
check's notes /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab10/NOTES.md (its probes are in that folder: reuse them as specs).
Work: local branch `api-base-10` (head 44f3324) in a NEW worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab10 (you commit on the branch);
`npm ci`, prisma generate; ports 5200-5209; TEST_DB_PREFIX=pab10. Run every command with your own worktree as the
working directory. A registry change (a field, a status) is ONE reopen citing IE1-IE3, reconcile twice identical,
freeze; ids already issued never change; .pipeline/ui-align-tasks.json byte for byte as it went in. Do not edit a
gate or a baseline.
 F1 (high, IE1) wishes.service.ts:404-427 limitsOf: a wish made for a Concierge order is a Signature wish: on the
    Signature line from its start, paid by the order (no ticket payment row, no second ledger line: prove both),
    with Signature's limits from the price book. The order's own file limits (today 20 photos, 3 voices) become
    what Signature holds times the order's count. Prove: a buyer gives the most the order allows; the maker puts
    ALL of it in the order's wish(es), seals and delivers; nothing given is unusable. The buyer still cannot see,
    pay for or upgrade the hidden wish (IC4); after delivery the buyer's wish reads as Signature.
 F2 (medium, IE2) payments.service.ts:143 and ticket-waiting.ts:20: an upper-case spelling of a wish id passes the
    ID1 gate (two ticket payments started). Normalise ids on the way in for EVERY payment start and subject id
    (find them all: list each place in the hand-back); spec: upper, mixed and lower case of one wish: one 201, the
    rest 409 with the reference; the wish read shows the waiting payment.
 F3 (low-medium, IE3) files of an order never paid: removed (rows and stored objects) 30 days after the order last
    changed, by the existing sweep job, the figure a price-book setting marked PROVISIONAL(owner); spec with the
    clock. A refunded order reads as refunded, not paid (use the order's existing states; if none fits, add the
    status in the same reopen).
 F4 (low) the buyer's erase: the maker cannot list or read the order's files from the moment of the erase, not
    only after the job runs; run the real erase job in a spec (register the handler in the test app).
Not yours: the missing down script (on the sweep list).
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, gates.sh, check-contracts, check-drift,
check-routes; the affected specs; then the full suite twice (`WEB_LIB=/nonexistent/lib npm test`): EXIT 0 twice.
Commit; do not push; remove YOUR worktree and databases; leave no jobs. Hand back ONCE in 10 lines: head; F1-F4
with file:line and the proof; the registry line; the EXIT lines; `git diff --stat 44f3324`.
