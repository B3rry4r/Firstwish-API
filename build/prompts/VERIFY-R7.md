CHECK R7 (re-scoped by the lead: the erase and refund cleanup landed with R1, R3 and R6; this run tests it, it builds nothing) | TIER T2 (deletes; a refund;
owner-only files) | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, only when `free -g` shows 5 GB or more (another job runs here); tests ONLY through `npm test -- ...` with `--maxWorkers=2` and
TEST_DB_PREFIX=vr7; never pkill, killall or pgrep -f (stop only PIDs you started, Chromium and ffmpeg children too); never edit, build, checkout or reset
anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves. S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Notes to $S/build/verify/r7/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md; build/tasks/RENDERER-PLAN.md section 3 (Erase) and the R7 row; rulings IK4, IK4a, IK3b, IK6j (in
build/rulings-phase3.md: grep them); src/modules/render-jobs/** and the wish erase handler (grep erasedAt, outputFileId, "render" purpose in server-files.ts).
Under test: API ccr-91b3ed11-fx445c (09b1c54, R6 merged) in your own detached worktree $S/build/wt/v-r7 (`npm ci`, `npx prisma generate`); stand-ins;
RENDER_ADAPTER=chromium only where a case needs a real file (a web worktree $S/build/wt/v-r7-web at web ccr-91b3ed11-fx445c, BUILT with API_ORIGIN).
Ports 5580-5599. Cases (each through the real HTTP routes, with the row, the stored files and the response you saw):
 1. A finished video, then the wish erased: the render file and the RenderJob row are gone (stored files before and after), the download 404s, the
    erase job is idempotent (run twice).
 2. A finished video, then its extra refunded: no download (the status code and words), the file removed or never served; a refund DURING a render:
    nothing stored (R6 showed it once: repeat once).
 3. The download address: owner only (another account 404, signed out 401), short-lived (after its lifetime: refused), not reusable by another
    account with the same link; a passcode wish's file is the owner's only and the ask screen words say it shows the wish without its passcode.
 4. The receiver never gets the file by any link (/w/<slug> and every public read: grep their responses for the file id).
 5. Account erase with a finished video and a render in flight: everything of the render gone, the worker writes nothing after.
Checks: typecheck; `npm test -- src/modules/render-jobs src/modules/wishes` (affected only).
Write $S/build/verify/r7/VERDICT.md (30 lines or fewer): R7 DONE (nothing to build) or FINDINGS by severity with file:line; NOT run. Stop what you
started; remove your worktrees; drop your databases. Hand back ONCE in 14 lines.
