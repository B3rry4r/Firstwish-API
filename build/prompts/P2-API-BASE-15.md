PATCH P-API-BASE-15 round 2 (the last) | TIER T2 money | Budget 30 steps. ONE finding; change nothing else.
Read ruling IJ3a in /home/user/Firstwish-API/build/rulings-phase3.md and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-15/VERDICT2.md. Work: branch `api-base-15` (158133c) of /home/user/Firstwish-API in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-15 (`npm ci`, prisma generate); TEST_DB_PREFIX=ab15.
 J1 MEDIUM (money: ₦4,000 a time) src/modules/refunds/refunds.service.ts:87 and :113 with
    src/modules/purchases/purchases.service.ts:109-110: staff send a refund of the premium-style extra while the
    wish holds an allowed style; before the refund is processed the customer picks a Premium style; the refund is
    processed: the money goes back, the extra stays (note kept_style_needs_extra): the customer has the premium
    style AND the money. IJ3a: from the moment its refund is SENT the extra no longer counts as held: the wish's
    style rule (the PATCH, the seal, the ticket start, allowedStyles) treats it as gone, so a style that needs it
    is refused in words that say a refund for the premium style is on its way; when the refund is processed the
    extra is removed as before; if the refund FAILS or is cancelled the extra counts again. The
    kept_style_needs_extra path can then no longer be reached by this order of events: prove it (a test that
    tries it and ends with either the style or the money, never both), and say whether any other order of events
    still reaches it.
Tests in src/modules/refunds/tests/ab15r1-ij3-extra-refund.spec.ts; 30 parallel style changes against the refund
being sent: never both. Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, gates.sh,
check-contracts, check-drift, check-routes, the purchases, wishes and refunds specs, then `WEB_LIB=/nonexistent/lib
npm test -- --maxWorkers=2` once: 0 failed. Commit on api-base-15; do not push; remove your worktree. Hand back
ONCE in 6 lines: head; J1 with file:line and the tests' names; `git diff --stat 158133c`; totals.
