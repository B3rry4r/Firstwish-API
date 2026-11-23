PATCH P2-API-BASE-19 | TIER T2, round 2 (the last) | Budget 40 steps. Close N1, N2, N3 and the sku list note; change nothing else; keep the src change small (about 30 lines).
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md, the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-19/VERDICT2.md (N1, N2, N3 and the H1
note, with file:line) and rulings IK3a, IK4a, IJ3, IJ3a (in /home/user/Firstwish-API/build/rulings-phase3.md).
Work: the local branch `api-base-19` of /home/user/Firstwish-API (head a70050b) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p2-ab19 (`npm ci`,
`npx prisma generate`); TEST_DB_PREFIX=p2ab19. Do not edit a gate or a baseline; no registry change. Each: FIRST a failing test through the real routes.
 N1 (medium, money): a video extra whose refund was SENT gives no download (404): right. Once the refund is PROCESSED
    the read gives the download back (render-jobs.service.ts `refundedVideo` returns false when adds is []). A person
    whose money went back keeps no download: sent or processed: 404; a refund that FAILED (the money stayed): the
    download is back. A wish whose TICKET includes the video is not touched by an extra's refund; a ticket refund
    follows the wish's own rules (say what they are; change nothing there).
 N3 (low): the wish read's video state must agree with the video read: where the read is 404 for a refund, the wish
    read does not say "ready" (say which state it gives, from the states HP5 already has; no new state).
 N2 (low): GET /v1/ticket-offers for keepsake + extra.portrait-video with no renderer quotes the unsold extra (200):
    it answers like the payment start would (the same refusal), or leaves the extra out with its `extrasOpen` false:
    pick the one the contract's shape allows with no wire change, and say which.
 Note (H1): the sku names in purchases/wish-rules.ts GIVE_SIGNATURE are hardcoded, so a NEW plan sku would not be
    caught. Add a test (not a new rule) that reads every sku the price book sells and fails with words when one is
    in neither the "its wishes can hold the video" set nor the "cannot" set, so a new sku cannot be added unclassified.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
render-jobs, refunds, purchases, payments and wishes folders' specs; then `WEB_LIB=/nonexistent/lib npm test --
--maxWorkers=2` once: 0 failed. Commit on api-base-19; do not push; remove your worktree. Hand back ONCE in 6 lines:
head; each id before and after; the src lines changed (count); the full run's totals.
