PATCH P-API-BASE-19 | TIER T2 (a receiver's secret; a paid extra), round 1 | Budget 60 steps. Close the named findings; change nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md, the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-19/VERDICT.md (H1, M1, M2, L1, L4, L5 with
their file:line) and rulings IK2a, IK3a, IK4a, IK5a (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Work: the local branch `api-base-19` of /home/user/Firstwish-API (head 5854cef) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab19 (`npm ci`,
`npx prisma generate`); TEST_DB_PREFIX=pab19. Do not edit a gate or a baseline. Registry: only if a wire field changes
(additive, one reopen, a DEC row); a note's words may change. Each finding: FIRST a failing test through the real routes, then the fix.
 H1 (IK3a): with no renderer, a payment start for ANYTHING whose entitlements include the portrait video is refused
    like the extra (409, words, no payment row, no provider call): the ticket levels that include it (Signature,
    Premiere today: read it from the entitlements book, never a list of names), a Pass, plan, bundle, business or
    Concierge line that includes it (list each route you found and its test); the read a person's ticket step uses
    says those are not available. With the stand-in renderer everything is sold as before.
 M1 (IK4a): an erased wish: GET /v1/wishes/:id/video is 404, no download address; say what the erase does with the
    stored video file (it must go with the wish's other files; prove). L1: an extra whose refund was SENT: no download.
 M2 (IK2a): outer spaces cut on set and on try for a passcode and an answer; 4 to 64 after the cut; spaces only: 422
    with words; an answer matched NFKC + lower case (L4: "Café" typed two ways; "STRASSE"/"Straße" as NFKC gives:
    say what matches). A passcode keeps its case. Wrong tries still count.
 L5: the doubled `if` at render-jobs.service.ts:80-81. L6 (IK5a): the contract note for doc.seen says what IK5a says.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the wishes,
payments, purchases, render-jobs and public-wishes folders' specs; then `WEB_LIB=/nonexistent/lib npm test --
--maxWorkers=2` once: 0 failed. Commit on api-base-19; do not push; remove your worktree. Hand back ONCE in 8 lines:
head; each finding before and after; routes found for H1; older tests changed and why; the full run's totals.
