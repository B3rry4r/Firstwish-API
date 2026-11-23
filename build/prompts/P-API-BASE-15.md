PATCH P-API-BASE-15 round 1 | TIER T2 money | Budget 60 steps. Close H1-H5 from the check of the fifteenth round; change nothing else.
ONE heavy job at a time, jest with `--maxWorkers=2`; commit per finding; final runs in the FOREGROUND.
Read /home/user/Firstwish-API/build/common-rules.md, rulings IJ2, IJ3, IJ4 in build/rulings-phase3.md, build/prompts/API-BASE-15.md and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-15/VERDICT.md (the probes beside it show each finding).
Work: branch `api-base-15` (2315e2a) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-15 (`npm ci`,
prisma generate); TEST_DB_PREFIX=ab15; ports 5200-5209. Do not edit a gate or a baseline. A registry change only
if a wire field changes (ONE reopen, additive, as the first brief says).
 H1 MEDIUM-TO-HIGH (IJ3) src/modules/purchases/wish-handlers.ts:126: the premium-style extra refunded AFTER the
    wish is sealed leaves a Premium style on a sealed Keepsake with the extra gone. The refund of that extra alone
    is refused in words while the wish holds a style that needs it (sealed or not); once the wish holds a style
    its ticket allows by itself, it can be refunded. Tests: before seal with the premium style held (refused),
    after a change to an allowed style (refunded, ledger right), after seal (refused), a whole-purchase refund
    (as today), the same for a creator's premium style; nothing is refunded twice.
 H2 MEDIUM (IJ4) src/modules/wishes/wishes.service.ts about line 548: changing the KIND with a style held is not
    re-checked (a love-only style on a group wish by a kind change: 200). Refused in words unless the style is
    offered for the new kind or replaced in the same PATCH.
 H3 MEDIUM (IJ4) wishes.service.ts about lines 395, 414-418, 155 and 178: a wish started with no style gets the
    default style (love only) on celebration, group and wedding kinds; the business draft and the Concierge maker
    take the first style that is on, of any kind; a later ticket start then answers 422. The server's own pick is
    a style that is on, offered for that kind and allowed by the ticket (starter with no ticket). A kind with no
    such style: say what happens (the wish starts with no style and the maker's style step is required) and test.
 H4 LOW that the web relies on: `allowedStyles` on the wish read filters by level only (362 styles offered across
    16 kind-by-ticket reads that the PATCH refuses): it lists exactly what a save would accept (level AND kind);
    a test that walks every kind by ticket and PATCHes every listed style (all 200) and one unlisted (422).
 H5 LOW .pipeline decisions DEC-306 to DEC-308 carry decidedAt 2026-12-07 (a date that has not come): the real
    date (2026-11-23), by the registry's own tool, reconcile twice identical.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, scripts/gates.sh, check-contracts,
check-drift, check-routes, the purchases, wishes, refunds and concierge specs, then `WEB_LIB=/nonexistent/lib npm
test -- --maxWorkers=2` once: 0 failed. Commit on api-base-15; do not push; remove your worktree. Hand back ONCE
in 10 lines: head; H1-H5 with file:line and the tests' names; older tests changed (each line and why); totals.
