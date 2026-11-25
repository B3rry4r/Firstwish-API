VERIFIER R6 | TIER T2 (the video maker goes live in the server: what is sold depends on it; a migration; a new process) | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND where it fits 8 minutes, only when `free -g` shows 5 GB or more (another browser job runs here); tests ONLY
through `npm test -- ...` or `npm run test:affected -- ...` with `--maxWorkers=2` and TEST_DB_PREFIX=vr6 on EVERY test command; never pkill, killall or
pgrep -f (stop only PIDs you started, Chromium and ffmpeg children too); never edit, build, checkout or reset anything in /home/user/Firstwish-API or
/home/user/Firstwish-web themselves; no `rm -rf` in a loop. S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Notes as you go to $S/build/verify/r6/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md; build/prompts/R6.md (the contract); rulings IK3, IK3a, IK3b, IK4a, IK6g, IK6i (END of build/rulings-phase3.md);
`git diff --stat 040ec83 r6` (29 files, +964/-80) and build/verify/r6/ on r6 (the builder's numbers).
Under test: local branch `r6` (head 02b5311, base 040ec83) of /home/user/Firstwish-API in your own detached worktree $S/build/wt/v-r6 (`npm ci`,
`npx prisma generate`); a base worktree $S/build/wt/v-r6-base at 040ec83 only for a compare; web worktree $S/build/wt/v-r6-web at web
ccr-91b3ed11-fx445c (`npm ci`, `next build`, `next start`; read only). Ports 5480-5499. Chromium /opt/pw-browsers/chromium; ffmpeg, ffprobe in /usr/bin.
The builder's claims (hand-back in the JOURNAL entry of 25 Nov "R6 handed back"): 1 binding checked at boot, OFF = NoVideoRenderer and nothing with
the video sold; 2 PROCESS_ROLE all, web, render-worker, RENDER_CONCURRENCY, lease renewed while frames come; 3 losses on the row (migration
20261212090000), twice lost = failed with Ask again, erase and refund mid-render abort and store nothing; 4 the token's own read bucket; 5 leftovers
sweep stops a PID only if it is the same process; 6 the staff line, cheap check starts no browser. NOT run by it: refund mid-render, Studio, owambe.
Attack (anything sold without a working video maker, a job done twice or never, a stored file after erase or refund, a wrong process killed, or the
token in a log, is HIGH):
 1. Sold or not: boot OFF (each missing part in turn: web origin, secret, Chromium, ffmpeg, ffprobe): every caller of configured() refuses the video
    (ask, ticket offers, price book, purchases); a purchase of a video price is refused BEFORE money; then ON: sold.
 2. Two render-workers on one database at once: a job is taken by exactly one (count renders); ten jobs with RENDER_CONCURRENCY=1: never two at once.
    The web role takes NO render job while a worker is down (the job waits, then the worker takes it).
 3. kill -9 the worker mid-render: retaken after a restart, done once; a worker on ANOTHER machine id: is a row of a dead worker ever released while
    its lease is live (a slow render must not be taken twice)? Lease renewal on a render longer than the first lease.
 4. Refund mid-render (the builder did not run it) and erase mid-render: aborted, no stored file, no fw-render file, the row's state and words.
 5. The leftovers sweep with a children.json whose PID now belongs to a DIFFERENT process (start your own sleep and write its pid with a wrong start
    time): it is NOT killed; an old folder of a live owner is NOT removed.
 6. The token bucket: flood the public link from one address, then the worker's read with the right token is not refused; 30 wrong tokens are limited.
 7. Migration: on a fresh database and on a database at 040ec83 with old render rows (made through the old code): migrate, old rows still read.
 8. Staff read: cheap check starts no Chromium (process list during 10 reads); deep check limited.
 9. Token and secret in no log line of either process, in no process command line.
Checks: typecheck; whole lint; scripts/gates.sh; check-contracts, check-drift, check-routes; the render-jobs, staff-reads, price-book, purchases,
wishes folders once. Do NOT run the full suite (refused command: do not retry, say NOT RUN).
Write $S/build/verify/r6/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line and numbers, claims confirmed or
refuted, NOT run. Stop what you started by PID; remove your worktrees and recordings; drop your databases. Hand back ONCE in 20 lines.
