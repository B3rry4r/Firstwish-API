PATCH R5F round 1 (rulings IK6h, IK6k) | TIER T2 (the video maker) | Budget 90 steps. Close the named findings. Nothing else.
Same rules as /home/user/Firstwish-API/build/prompts/R6.md lines 2 to 5 (read them; TEST_DB_PREFIX=pr5f; logs $S/build/logs/pr5f-*.log). Another stack job runs here.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Read /home/user/Firstwish-API/build/common-rules.md; build/prompts/R5F.md (the contract);
build/handover/verdicts/r5f-VERDICT.md and w19-VERDICT.md; the web's scripts/lib/clock-shim.mjs, components/render/**, components/engine/Host.tsx.
Work: API branch `r5f` head f4c8776 in your own worktree $S/build/wt/pr5f (`git worktree add $S/build/wt/pr5f r5f`, `npm ci`, `npx prisma generate`).
Web: a NEW local web branch `w21` from web ccr-91b3ed11-fx445c 3c9b8e6 in your own worktree $S/build/wt/pr5f-web (`npm ci`, `next build`, `next start`).
Ports 5320-5339. You own, API: src/modules/render-jobs/** and its tests; web: components/render/**, scripts/lib/clock-shim.mjs and its test.
You do NOT own components/styles/** or components/engine/** (another builder, P2-W20, has the style files): a cause there is reported with
file:line and the change it needs, not edited.
 H1 Letter from a COLD web (fresh `next start`, fresh recorder) differs from a warm one: frames 1 to 25, the card higher and turned (box x24-536,
    y1072-1720), fonts and images settled. FIRST show it (dump the input JPEGs), then FIND the cause, file:line and why (e.g. a style chunk loaded
    by real time on first load so its entrance starts at a later step; an animation created before the clock holds it; the recorder's frame 0 at
    chromium-video-renderer.ts:868). Fix it where you own the file. Prove: letter, 6 pairs each from a cold web, 0 differing decoded frames; one
    pair under load; then Studio and owambe one cold pair each.
 M2 realFrames (chromium-video-renderer.ts:843-852): on "Cannot find context" make the world again and retry once; count the times the 400 ms cap
    is hit and say the count in the render's log line (no token in it). A spec for both.
 L3 build/verify/r5f/numbers.md: put part 5's result in it (it says "see the hand-back").
Checks: API: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the render-jobs folder. Web, if w21 has
a commit: `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint` (863 or fewer), `npm run build`, stepped-clock.test.mjs.
Commit on r5f (and w21); do not push; stop what you started by PID; remove your worktrees and recordings; drop your databases. Hand back ONCE in
10 lines: heads; the cause (file:line); numbers; anything in a file you do not own; NOT run.
