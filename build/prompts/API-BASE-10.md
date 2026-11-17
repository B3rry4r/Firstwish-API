BUILDER API-BASE-10 | TIER T2 | Budget 190 steps. Two things the screens cannot be finished without: one ticket payment per wish, and the buyer's files for a Concierge order; change nothing else.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`
except the final full runs, and a commit on your branch at every closed case. Stop only PIDs you started.
Read /home/user/Firstwish-API/build/common-rules.md, rulings ID1, IC7, IC4, HY1, HZ3, HU6, HZ2 in build/rulings-phase3.md, the list
build/sweeps/api.md (the section "For API-BASE-10") and how API-BASE-9 reopened the registry (build/prompts/
API-BASE-9.md). ONE reopen for all registry changes here, decisions citing the ruling ids, reconcile twice identical,
freeze; ids already issued never change; `.pipeline/ui-align-tasks.json` must come out byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-10` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line: it must already hold the
ninth round: check `git log` for "API-BASE-9"; if it does not, HALT and say so) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-10 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab10. Run every command with
your own worktree as the working directory; never commit on claude/sleepy-mayer-f0hkb8 itself. Do not edit a gate
or a baseline; an older test changes only where a ruling makes its expectation wrong (name each line and why). Test
rows use test/kit/unique.ts for unique values and count only their own. No deferral phrasing in src comments.
Cases (through the real routes; a test for each; in this order):
 1. ID1 (money): the verifier of the maker's pay screens charged one person twice for one wish: Moment paid in one
    browser and Keepsake in another, both payments open, both settled (300000 + 600000 kobo), the wish sealed as
    Keepsake, nothing said, no refund. (a) A ticket start while a ticket payment of that wish waits is 409 with
    words and the waiting payment's reference (the same ticket with the same key still returns the same payment);
    (b) the wish read says a ticket payment is waiting (which ticket, the reference, when it lapses); (c) the owner
    drops a waiting ticket payment at once (abandoned; a new start is then allowed); (d) a ticket payment that
    settles when the wish already holds a paid ticket is refund due (said on its read; the refund notice when it
    is refunded); the same for an extra bought twice. Attacks: Moment and Keepsake started at the same moment (30
    pairs: one payment row waiting, the other 409); both settle at once where two rows already exist (older data:
    one ticket on the wish, the other refund due, the ledger balanced); drop and settle at once; a business
    draft on its plan (no payment) beside a ticket start.
 2. IC7 (Concierge, T-12, T-13): the buyer gives photos and a voice note with the order: an upload purpose tied to
    the order (the same signed put, confirm, screening and limits as a wish's photos and voice), from placing the
    order until it is delivered; the buyer lists and removes them; the order's maker (and the owner) lists them by
    signed reads and adds them to the wish being made for that order (they stay the buyer's files; the buyer's
    Vault and wish limits are not touched by them: say what limit applies); nobody else reads them; cancel,
    refund, delivery and the buyer's erase each leave the right thing (after delivery the files in the wish stay
    with the wish; the unused ones go). Attacks: another buyer, another maker, the maker after the order moves, a
    file not ready, a file over the limit, 40 files.
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, scripts/gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test` twice in a row with 0 failed. Commit on
api-base-10; do not push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 10 lines:
head; each case closed or not with the test's name; new endpoint and decision ids; totals; what you could not do.
