PATCH P-API-BASE-9 | TIER T2 money and identity | Budget 130 steps. The check's findings; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs, and a commit on the branch at every closed finding. Stop only processes you started, by their PIDs.
Read /home/user/Firstwish-API/build/common-rules.md, rulings IC1-IC7, IA1, IA4, IB1-IB6, HZ2 in build/rulings-phase3.md, and the verifier's
notes and probes in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab9/ (NOTES.md, vab9-a/b/c.spec.ts): run the probes for findings 2, 3, 4, 6
FIRST and see them fail on this head.
Work: commit on local branch `api-base-9` (00ac9ff) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab9 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab9 api-base-9`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab9. Run every command
with your own worktree as the working directory. If the registry must change, ONE reopen; ids already issued never
change. No deferral phrasing in src comments. A test makes its own rows with values that cannot collide.
 F1 (medium, IC1) reveals.service.ts:~487-494 copyLink: a copied link takes the reveal's passcode, downloads switch,
    on/off and end (today: downloads default true; a copy after switch-off or end is ungated); `again` keeps the
    passcode unless a new one is given. Test every one of the verifier's four ways in (its finding 5 a-d): (a) stays
    as designed (say so in the test's name); (b), (c) and the downloads bypass close.
 F2 (medium, IC2) favourites are stored by file id (migrate the positions already stored); removing a file removes
    its heart; a copied or re-sent link shows the same hearts for the same files; shoot.hearts agrees.
 F3 (medium, IC3) E-33 for a shoot and client that already has a reveal answers 409 already_sent (when, the link)
    unless again; the three call orders the verifier ran end as IC3 says (say the pack count after each).
 F4 (IC4) /v1/me and every count leave out a wish being made for an order; the buyer's keep, upload, qr-card and
    every other route answer 404 for its id; its public link opens for nobody before delivery; E-34's typed
    wishIds cannot deliver a wish tied to ANOTHER order (concierge.service.ts:~348).
 F5 (IC5) plays counted by link and address (capped per hour), not by x-reveal-session; the 61st mark's 429 names
    the real wait; an Idempotency-Key reused with another shoot or client is 409.
 F6 (IC6) names: control and direction-override characters removed; dots alone refused.
 F7 (the pool) settle (and the other money transactions) wait for a connection as long as production needs (Prisma's
    maxWait: today the 2 s default fails with "Unable to start a transaction" when about ten settles wait on one
    account): set it in the one place transactions are opened, and prove 60 contended settles end with none failed.
 NOT in this patch (ruling IC7, the next round): the buyer's photos for a Concierge order.
Checks (quiet logs, EXIT lines): typecheck, eslint on the changed files, gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test` THREE times in a row with 0 failed (if
support/tests/support.spec.ts fails in one, capture its text and say what it depends on). Commit on api-base-9; do
not push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 10 lines: head; F1-F7
closed or not with file:line and the test's name; new ids; the three run totals; `git diff --stat` against 00ac9ff.
