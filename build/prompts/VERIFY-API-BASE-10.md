VERIFIER API-BASE-10 | TIER T2 money and identity, full | Budget 110 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: run ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs, and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab10/NOTES.md as you go (a restart must not lose them). If NOTES.md
or your worktree already exists, an earlier verifier was lost: read NOTES.md and carry on.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-10.md (its cases are the contract), rulings ID1, IC7, IC4, HY1,
HZ2, HZ3, HU6 in build/rulings-phase3.md, and the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/api-base-10-claims.txt.
Under test: /home/user/Firstwish-API, local branch `api-base-10` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab10 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab10. Run every command with
your own worktree as the working directory. Probes as specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab10/ (not in the repo). Remove
your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw; count payments, tickets, the wish's line and
the ledger after each). In this order:
 - One wish is paid for once (ID1, money): two ticket starts for one wish at once (same line, different lines,
   two logins of one person, 30 pairs); a start while one waits: 409 with the reference, in words; both settle by
   webhook at once and one after the other, in both orders; a forged, replayed and late webhook; the provider
   says paid AFTER the owner dropped it (refund due, the wish untouched, the notice); drop by another account,
   drop twice, drop a paid one, drop a plan or pack payment through this route; an expired waiting payment: does
   it free the wish (after how long) or lock it for good? A premium-style extra, a keep and a wake beside a
   ticket payment: must NOT be blocked by it, and are they refunded wrongly by the new rule? A Pass seal and a
   business draft (no ticket payment): untouched. Anyone charged twice with one ticket and nothing said is HIGH;
   a wish that can never be paid for again is HIGH.
 - The older test's two changed lines (purchases.spec.ts 140, 142): is the new expectation what ID1 says, or did
   the builder bend the test to its code?
 - Concierge files (IC7, identity): the buyer uploads photos and voice WITH an order (before paying? after? while
   it is being made?); the limits 20 and 3 in words; the maker reads them (E-279) and adds them to the order's
   wish (E-280): another maker, the same maker after the order moves, ops, another buyer, a maker on the buyer's
   other wishes or other orders: 404 on read and write; the file addresses are signed and short-lived; a file
   not ready or refused by screening cannot be added; the maker's add hits the wish's own limit (6 photos on the
   Moment line, the builder says): can a maker then finish a wish with the 20 photos the buyer gave? Say exactly
   what a Signature Concierge wish can hold end to end (that it cannot use what was sold is HIGH).
 - Lifetimes: delivery (used files stay with the wish and are the BUYER's after hand-over? unused ones go);
   cancel, refund, the buyer's erase, an order never paid: the files and their stored objects go (list the
   stand-in store before and after); nothing counts against the Vault or the buyer's wish limits.
 - The buyer still cannot see the hidden wish before delivery by any of the four new routes (IC4).
 - The registry: 281 endpoints; E-279..E-282 added and no issued id changed; check-contracts, check-drift,
   check-routes EXIT 0; the migration applies on a database that has orders, payments and tickets in every state
   (make them first on the base commit, then migrate), and its rollback keeps the rows.
 - The suite: the builder saw ONE unrelated failure in four of nine full runs. Run the full suite THREE times
   (`WEB_LIB=/nonexistent/lib npm test`, default workers, nothing else of yours running): for each failure give
   the spec, the test and whether this branch touches it or makes it likelier (new rows in a shared table, a new
   global limit). A failure this branch causes is a finding; one that the base has too is reported apart.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not run.
