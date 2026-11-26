VERIFIER V1 (UA-725; rulings IK3, IK4, IK4a) | TIER T2 re-run (a test-only change: the flow v1-video.mjs) | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
Same rules as /home/user/Firstwish-API/build/prompts/R6.md lines 2 to 5 (read them; TEST_DB_PREFIX=vv1; logs $S/build/logs/vv1-*.log). Notes to $S/build/verify/v1/NOTES.md.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Read build/prompts/V1.md (the contract) and the flow scripts/live/flows/v1-video.mjs.
Under test: web branch `v1` head ba469f6 (on 82315b7) in your own detached worktree $S/build/wt/vv1 (`npm ci`, `next build`); API worktree $S/build/wt/vv1-api
at API ccr-91b3ed11-fx445c (detached; `npm ci`, `npx prisma generate`); two API processes (PROCESS_ROLE=web and render-worker, RENDER_ADAPTER=chromium,
STANDIN_STORAGE_DIR shared, the other providers on stand-ins) and the built web, ports 5340-5359.
Claims: a person asks, pays (stand-in), waits (~54 s) and downloads an MP4 (h264 1080x1920 30 fps 14.57 s) for a house style and for Studio; another
account sees nothing (404); a Signature ticket gets "Send me the video" with no price; two losses give "Ask again" with no second payment; a refund
mid-render shows its words and nothing to download; with the recorder not able to work, no video control is drawn.
 1. Run the flow yourself on that stack: every case; does each check assert what its line says (read the code of three checks)?
 2. Attack: tap "Get the video" twice quickly, and pay twice by replaying the stand-in webhook: one payment, one render. Read another account's
    download address with the first account's link: refused. The download address expires (IK4a: owner-only, 10 minutes).
 3. `npx tsc --noEmit`, `npm run gates`, `npm run lint` (863 or fewer); only the flow file in the diff.
Write $S/build/verify/v1/VERDICT.md (20 lines or fewer): MERGE or FIX FIRST, findings with file:line, NOT run. Stop what you started by PID (Chromium and
ffmpeg too); remove your worktrees and recordings; drop your databases. Hand back ONCE in 10 lines.
