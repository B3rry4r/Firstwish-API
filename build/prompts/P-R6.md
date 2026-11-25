PATCH R6 round 1 (ruling IK6j) | TIER T2 (the video worker) | Budget 45 steps. Close MED-1, MED-2 and LOW-1 of the verdict. Nothing else.
Tests ONLY through `npm test -- ...` with `--maxWorkers=2` and TEST_DB_PREFIX=pr6; never pkill, killall or pgrep -f (stop only PIDs you started, with
their Chromium and ffmpeg children); never edit, build, checkout or reset anything in /home/user/Firstwish-API itself; never edit a test you did not write.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Quiet logs in $S/build/logs/pr6-*.log ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md; /home/user/Firstwish-API/build/handover/verdicts/r6-VERDICT.md; ruling IK6j (END of build/rulings-phase3.md).
Work: the local branch `r6` (head 02b5311) in your own worktree $S/build/wt/pr6 (`git worktree add <path> r6`, `npm ci`, `npx prisma generate`); ports 5500-5519.
 MED-1 chromium-video-renderer.ts:527 and :680 (and any other spawn of the recorder, ffprobe in the binding check): the child's env is a short allow-list;
       a spec reads /proc/<child pid>/environ during a render (or the spawn options) and finds no DATABASE_URL, JWT_*, INTERNAL_TOKEN, RENDER_TOKEN_SECRET.
 MED-2 the dead-holder check (hostname equality): IK6j (2); RENDER_WORKER_ID in env.schema.ts and the env manifest in plain words; a spec: a row held by
       a different id with a live lease is never freed; the same id after a restart is freed at once; with no id, only lease expiry frees.
 LOW-1 the leftovers sweep (render-leftovers.ts): an alive owner's folder and children are kept whatever their age; a spec for it.
Checks: typecheck; `npx eslint` on changed files; scripts/gates.sh; check-routes; `npm test -- src/modules/render-jobs src/common/env`.
Commit on r6 (trailers in common-rules); do not push; remove your worktree; drop your databases. Hand back ONCE in 8 lines: head, diff --stat, each item with its spec.
