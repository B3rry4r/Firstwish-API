BUILDER R3B | TIER T2 small (a stand-in only; it handles a secret) | Budget 50 steps. A test stack can learn a render token and hold a render open; nothing else.
Machine: 4 CPUs, 15 GB (it restarted once today). ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only
PIDs you started); never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves; final runs in the FOREGROUND, quiet
logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md; ruling IK7 (the END of /home/user/Firstwish-API/build/rulings-phase3.md) and IK3, IK6 there; src/common/env/env.ts around STANDIN_MAIL_OUTBOX
(:165: how a stand-in file is allowed and refused) and STANDIN_VIDEO; src/modules/render-jobs/video-renderer.ts (StandinVideoRenderer),
render-token.ts (:62-63: a token is spent only while its job is rendering), render-jobs.service.ts.
Work: /home/user/Firstwish-API, local branch `r3b` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/r3b (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=r3b. Do not edit a gate or a baseline; no wire
change; no registry reopen; no older test's expectation changed.
Why: the web's render page (the next task) must be driven on a test stack: its flow needs a real token and a job that
is still rendering when the page reads. Today the stand-in renderer discards the token and returns at once.
Cases (a test for each; FIRST show what the head does today):
 1. STANDIN_RENDER_TOKENS=<file path>: allowed only with PROVIDERS=standin AND NODE_ENV not production; with live
    providers or production the server REFUSES TO BOOT with words (exactly as STANDIN_MAIL_OUTBOX does): prove both.
    When set, StandinVideoRenderer.render() appends one JSON line {jobId, wishId, kind, width, height, seconds,
    token} to that file, created with mode 0600 (prove the mode), never to a log. When not set: nothing is written
    anywhere (as today).
 2. STANDIN_VIDEO=hold (beside the existing `fail`; the same refusal at boot): the stand-in waits, after writing its
    line, until this job's token is spent (render_job.tokenUsedAt set) or the job's abort signal fires, or a cap
    (RENDER_STANDIN_HOLD_SECONDS, default 120), then writes its marked file as today. While it holds, the read
    GET /v1/render/:token/wish with that token answers 200 once; the job then ends done and the wish read says ready.
    The abort (the time limit, an erase) during the hold ends it at once with no file (IK4a).
 3. The names are in env.schema.ts and .pipeline/env-manifest.json with what they are for and "test stacks only".
 4. Nothing else changes: with neither set, the render-jobs folder's specs pass untouched; the real binding's
    configured() stays false (nothing that includes the video sells with live providers: run the round 19 spec).
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
render-jobs and env folders' specs; then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0 failed (start it
only when `free -g` shows 8 GB or more; if your session refuses that command, do not retry and ask nobody: say NOT
RUN). Commit on r3b; do not push; remove your worktree. Hand back ONCE in 6 lines.
