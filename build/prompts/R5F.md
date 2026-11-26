BUILDER R5F, the recorder follow-up (rulings IK6h, IK6k) | TIER T2 (the video maker: a paid thing is sold by it) | Budget 110 steps. The recorder repeats frame for frame, under load, for every kind of wish, and the Studio proof R6 could not run. Nothing else.
Same rules as /home/user/Firstwish-API/build/prompts/R6.md lines 2 to 5 (read them; TEST_DB_PREFIX=r5f; logs $S/build/logs/r5f-*.log). Another stack job runs here.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Read /home/user/Firstwish-API/build/common-rules.md; rulings IK6h to IK6k (END of
build/rulings-phase3.md); build/handover/verdicts/w19-VERDICT.md; build/verify/r6/numbers.md; src/modules/render-jobs/** (chromium-video-renderer.ts
openSegment :931; the token; video-binding.ts; render-worker.ts); the web's scripts/lib/clock-shim.mjs (read only).
Work: local API branch `r5f` from ccr-91b3ed11-fx445c (head in your spawn line) in your own worktree $S/build/wt/r5f (`npm ci`, `npx prisma generate`);
web worktree $S/build/wt/r5f-web at web ccr-91b3ed11-fx445c 3c9b8e6 (W19 merged; `npm ci`, `next build`, `next start`; read only); ports 5320-5339.
You own src/modules/render-jobs/** and its tests. Do not edit a gate or a baseline; no registry change.
 1. openSegment encodes with `-threads 2`, and the same input frames gave different files: make the encode deterministic (say the cost in
    seconds per second of video, before and after).
 2. M3 (tests/r5-chromium-renderer.spec.ts:495) failed at load 7.6 to 9.7: find why a stand-in page's frames depend on load (a screenshot taken
    before the frame is drawn? the step's wait?) and fix it in the recorder; run the spec 3 times while the other stack job loads the machine
    (print the load average): 37 of 37 each.
 3. A real wish through ChromiumVideoRenderer, 1080 x 1920, 8 s, one epochMs, twice, decoded frames (framemd5): Studio, letter, reel, owambe,
    polaroid-table: 0 differing each; one pair under load. Then 15 s of owambe and of letter: seconds of work per second of video, peak memory.
 4. The Studio proof R6 could not run: two processes (PROCESS_ROLE=web and render-worker, RENDER_ADAPTER=chromium, the other providers on stand-ins,
    the built web beside them): a person with a Studio wish asks for its video through the REAL routes: done; ffprobe h264, 1080 x 1920, 30 fps, the
    length; the owner's download gives the MP4; another account gets 404; three frames into build/verify/r5f/.
 5. A polaroid-table recording once answered "404 This render is not available" (the W19 patch builder, cause not looked at). Find out when the
    render read says that to the recorder (token lifetime against a long render? a retry after the row moved?), show it, and fix it if the server
    is wrong, or say why it is right.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the render-jobs folder's specs; do NOT run
the full suite. Commit on r5f after each numbered part; do not push; stop what you started by PID; remove both worktrees and recordings (keep the
numbers and frames under build/verify/r5f/ in your worktree's commit); drop your databases. Hand back ONCE in 12 lines: head; 1 to 5 each done or
NOT DONE with numbers; what the real server must have; NOT run.
