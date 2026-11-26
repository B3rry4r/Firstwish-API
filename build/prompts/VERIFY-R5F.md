VERIFIER R5F, the recorder follow-up (rulings IK6h, IK6k) | TIER T2 (the video maker) | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Same rules as /home/user/Firstwish-API/build/prompts/R6.md lines 2 to 5 (read them; TEST_DB_PREFIX=vr5f; logs $S/build/logs/vr5f-*.log). Another stack job runs here.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Read /home/user/Firstwish-API/build/common-rules.md; build/prompts/R5F.md (the contract);
build/handover/verdicts/w19-VERDICT.md; rulings IK6h to IK6k. Notes to $S/build/verify/r5f/NOTES.md.
Under test: local API branch `r5f` head f4c8776 (2 commits on 76bf11b) in your own detached worktree $S/build/wt/vr5f (`npm ci`, `npx prisma generate`);
web worktree $S/build/wt/vr5f-web at web ccr-91b3ed11-fx445c 3c9b8e6 (`npm ci`, `next build`, `next start`; read only); ports 5340-5359.
The builder's claims: x264 on one thread (no cost: ~10 s of work per video second); two real frames from an isolated script world before every
shot (400 ms cap); M3 never failed here, the spec passes 37 of 37 three times at load 9 to 13; H1 spec page now calls __vt.frame(); studio, reel,
owambe, polaroid 0 differing decoded frames; letter's FIRST pair 60 of 160 differ, later pairs 0 (a cold first load?); the Studio proof through two
processes (done 48 s, h264 1080 x 1920 30 fps 14.57 s, other account 404); the render read's 404 only for a bad token or a wish not live (410 after).
Attack (a recording that differs between two runs of one wish, a token in a log, or a render read that refuses the worker wrongly, is HIGH):
 1. Letter from COLD (a fresh `next start` and a fresh recorder each time): 3 pairs, decoded frames (framemd5); and a pair while the other job
    loads the machine. If the first one differs, dump the input JPEGs and say which frames and what differs (a font? an image decode?).
 2. The isolated-world wait: what happens when its 400 ms cap is hit (silent?), and after a navigation or reload of the page (is the world still
    there, or does realFrames return at once with world 0?). Prove one or the other with a small run.
 3. `npm ci` alone gives a worker that can load playwright-core (the builder linked it by hand): start `npm run start:render-worker` in a clean
    worktree and record one wish; else it is a finding with the fix named.
 4. The r5 and r6 specs and the render-jobs folder; typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes.
    The token in no log line of either process (grep both logs).
Write $S/build/verify/r5f/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line, claims confirmed or refuted, NOT
run. Stop what you started by PID; remove your worktrees and recordings; drop your databases. Hand back ONCE in 20 lines.
