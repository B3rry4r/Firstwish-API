PATCH P-API-BASE-9b | TIER T2 small | Budget 45 steps. Two findings from the second check; a small diff the lead reads; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at each closed finding; stop only PIDs you started.
Read /home/user/Firstwish-API/build/common-rules.md and rulings IC1, IC4 in build/rulings-phase3.md. Work: commit on local branch `api-base-9`
(9c24ebe) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab9b (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab9b api-base-9`; `npm ci`; prisma
generate); ports 5200-5209; TEST_DB_PREFIX=pab9b. Run every command with your own worktree as the working directory.
 F1 (medium, IC4, identity) src/modules/wishes/wishes.service.ts:~355-362 (create: the Idempotency-Key lookup and
    the "mine" bare-start lookup) do not use the SHOWN_TO_BUYER rule: a buyer's POST /v1/wishes returned the
    maker's hidden Concierge wish (200, its id) and bound the key to it. Both lookups leave out a wish being made
    for an order. Then grep the module once more for any other read of "the person's wishes" that create, start,
    resume or pick-up paths use without the rule, and name each you checked. Tests: a buyer with a wish being made
    for their order starts a wish with the same name, with and without a key: a NEW wish of their own, never the
    hidden one; after delivery the delivered wish behaves as any wish of theirs.
 F2 (low-medium, IC1) src/modules/.../reveals.service.ts `off()` (~:500) and `setDownloads()` (~:494) do not carry
    to links already copied (carryToCopies runs only in the send and copy paths): switching a reveal off kills
    EVERY link to it at once (410), and switching downloads off stops downloads on every link at once. Tests: copy
    a link, switch off: the copy is 410 on the next read; copy, downloads off: no address on the copy; back on:
    both return.
Checks (quiet logs, EXIT lines): typecheck, eslint on the changed files, gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test` TWICE in a row with 0 failed, as the only
heavy job you run then. Commit on api-base-9; do not push; remove your worktree and databases; leave no background
jobs. Hand back ONCE in 7 lines: head; F1 and F2 with file:line and the tests' names; the other reads you checked;
both run totals; `git diff --stat` against 9c24ebe (source lines apart from tests).
