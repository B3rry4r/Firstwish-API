BUILDER API-BASE-11A | TIER T2 | Budget 150 steps. Money and identity items the screens and the real provider need; change nothing else.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`
except the final full runs, and a commit on your branch at every closed case. Stop only PIDs you started. If the
branch, worktree or a NOTES.md already exists, an earlier agent was lost: read git log and carry on.
Read /home/user/Firstwish-API/build/common-rules.md, rulings IF1, IF2, IF3, IE2, ID1, HU1, HU3, HY1 in build/rulings-phase3.md, the list in
build/sweeps/api.md (section "For API-BASE-11") and how API-BASE-10 reopened the registry (build/prompts/API-BASE-10.md).
ONE reopen for all registry changes here, decisions citing the ruling ids, reconcile twice identical, freeze; ids
already issued never change; `.pipeline/ui-align-tasks.json` byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-11a` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-11a (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab11a. Run every command with
your own worktree as the working directory. Do not edit a gate or a baseline; an older test changes only where a
ruling makes its expectation wrong (name each line and why). Test rows use test/kit/unique.ts and, where a spec
reads rows other specs make, test/kit/own-db.ts. No deferral phrasing in src comments.
Cases (through the real routes; a test for each; in this order):
 1. IF1 (money, the real provider): every payment start takes an optional return path (ticket, extra, keep, wake at
    the link and by the owner, plan, pack, Concierge, Studio). The provider is given the site's address + that path
    + the reference; the stand-in provider returns there too. Refused in words: an outside address, "//host", a
    scheme, a backslash, a path the web does not serve for that subject, 2,000 characters, control characters.
    The same start with the same key and a different path: say which wins and test it. No path: today's behaviour.
 2. IF2 (identity): a non-id at EVERY route that takes an id (find them with the route table; list the count):
    422 in words, never 500; upper and mixed case of a real id reads, drops and settles the same thing as lower
    case (the wish read, the payment read and drop by reference, the link routes).
 3. IF3 (money): an extra's start while the same extra's payment for that wish waits is 409 with the reference;
    the owner drops it (E-282 takes it); two different extras at once are both allowed; 30 pairs at once.
 4. The contact route (POST /v1/support-threads/contact) takes an Idempotency-Key: the same key and body is one
    thread; the same key with another body is 409; no key behaves as today.
 5. Lows: a refund of a Concierge order removes its stored objects at once (not at the next sweep); the
    concierge_order_file migration gets the same kind of down script the other migrations have (if none has one,
    say so and leave it).
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, scripts/gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test` twice in a row with 0 failed. Commit on
api-base-11a; do not push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 10 lines:
head; each case closed or not with the test's name; new endpoint and decision ids; totals; what you could not do.
