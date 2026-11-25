VERIFIER R6 re-check (ruling IK6j) | TIER T2 (the video worker) | Budget 25 steps. You did not build this. Test, do not trust. You fix nothing.
Tests ONLY through `npm test -- ...` with `--maxWorkers=2` and TEST_DB_PREFIX=v2r6; ONE heavy job at a time, only at 5 GB free (`free -g`); never pkill,
killall or pgrep -f (stop only PIDs you started, Chromium and ffmpeg children too); never edit, build, checkout or reset anything in /home/user/Firstwish-API
or /home/user/Firstwish-web themselves. S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad.
Read build/handover/verdicts/r6-VERDICT.md (MED-1, MED-2, LOW-1); ruling IK6j (END of build/rulings-phase3.md); `git diff 02b5311 7f42893` (8 files, +195/-18).
Under test: local branch `r6` head 7f42893 in your own detached worktree $S/build/wt/v2-r6 (`npm ci`, `npx prisma generate`); ports 5520-5539. A web
worktree $S/build/wt/v2-r6-web at web ccr-91b3ed11-fx445c, BUILT with API_ORIGIN set (`npm ci`, `next build`, `next start`; read only).
 1. MED-1 on a REAL render (the builder checked only a sleep child and the launch options): during a render read /proc/<pid>/environ of the live
    Chromium, its renderer children and ffmpeg: no DATABASE_URL, JWT_*, INTERNAL_TOKEN, RENDER_TOKEN_SECRET, REDIS_URL, PAYSTACK_*, RESEND_*; the
    render still succeeds (fonts, locale).
 2. MED-2: a row held by a different RENDER_WORKER_ID (or a hostname-shaped holder) with a live lease is not freed by a restarting worker; the same id
    after kill -9 is freed at once; no id: only lease expiry.
 3. LOW-1: a live owner's old folder and child are kept; a dead owner's are removed and the child stopped.
 4. The builder EDITED two assertions in tests/r6-worker.spec.ts (a spec another agent wrote): read both hunks; does each only follow IK6j, or does it
    weaken a check of something else?
Checks: typecheck; `npx eslint` on changed files; `npm test -- src/modules/render-jobs src/common/env`.
Write $S/build/verify/r6/VERDICT2.md (20 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line. Stop what you started; remove your
worktrees; drop your databases. Hand back ONCE in 10 lines.
