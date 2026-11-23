PATCH P-R1 | TIER T1, round 1 | Budget 55 steps. Close the named findings of the verdict; change nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/R1.md, the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r1/VERDICT.md (H1, M2, M3 and the lows,
with file:line) and its probe /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r1/vr1-probe.spec.ts (how it reached each).
Work: the local branch `r1` of /home/user/Firstwish-API (head eff1f14) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-r1 (`npm ci`, `npx prisma generate`);
TEST_DB_PREFIX=pr1. Do not edit a gate or a baseline; no wire change. Each finding: FIRST a failing test THROUGH THE JOB
PATH (the queue's tick claims and runs the job; not a direct call of the service's run), then the fix.
 H1 (high): a worker lost mid-render is never recovered: the job is retaken at its own lease (limit + 60 s) while
    the render ROW's lease is 25 minutes or more; run() answers "skipped", the job is marked succeeded, the row
    stays "rendering" for ever and the ask returns it as it is; "dead after 2 tries" cannot be reached. Make the two
    leases one rule (the row cannot outlive the job that holds it; a retaken job takes the row over only when the
    first holder can no longer write: say how that is known), a "skipped" run never marks the job succeeded while
    the row is unfinished, the second loss ends the row FAILED (the wish read says failed; the person can ask
    again; one job, no second payment). Prove with the stand-in clock: lost once then done; lost twice then failed.
 M2: a render waiting for a place (RENDER_CONCURRENCY) spends its 20-minute limit while it waits: the limit counts
    from when the render starts, or a job with no place goes back to the queue without using a try.
 M3: an erase, or the time limit, DURING the store write: the upload is stopped, no file row and no storage object
    are left (now, not only after the queued cleanup), the row ends failed (or nothing for an erased wish).
 Lows: the job stores and deletes only a path INSIDE its own temp folder (a path outside, or a symlink out of it,
    is refused: the job fails with words in the log, nothing read, nothing deleted); a waiting render whose wish
    is erased leaves the line at once; a down note for migration 20261208090000.
 NOT yours (a note for task R6, do not build): the queue's tick is serial, so one long render holds every other
    job kind in that process and RENDER_CONCURRENCY above 1 never applies: the renderer needs its own worker process.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
render-jobs and jobs folders' specs; then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0 failed (if
your session refuses that command, do not retry and ask nobody to run it: say NOT RUN). Commit on r1; do not push;
remove your worktree. Hand back ONCE in 8 lines: head; each finding before and after; older tests changed and why;
the full run's totals or NOT RUN.
