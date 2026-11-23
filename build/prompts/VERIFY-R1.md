VERIFIER R1 | TIER T1, lean (the video port: a file result, abort, the job's time) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r1/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/R1.md (its cases are the contract), task R1 and section 8 of /home/user/Firstwish-API/build/tasks/RENDERER-PLAN.md,
rulings IK3, IK3a, IK4a, IK6 (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Under test: /home/user/Firstwish-API local branch `r1` (head eff1f14) against its base c78b61f. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r1 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=vr1. Probes as specs under the verify folder.
The builder's claims: render() gives {path, contentType, bytes: size}; the job streams the file to the store (new
`writeFile`, hash on the way): 40 MB with max chunk under 4 MB, RSS rise under 60 MB, stored size and sha256 match;
no temp file left after success, a store refusal or a renderer failure. The job's signal reaches the renderer; an
erase poll aborts a running render (job failed, no file, IK4a). A `render-video` job kind row of 1200 s (migration
20261208090000_render_video_job_kind_r1, data only), lease = limit + 1 min, RENDER_LEASE_MS 25 min, 2 tries then dead;
a 12-minute render on the stand-in clock is not claimed twice. RENDER_CONCURRENCY is read (an in-process gate): 1
gives overlap 1. Six RENDER_* env names optional; the live binding's configured() stays false with all set, so
nothing that includes the video sells (409) and an ask is 503. premiere-clip: asked for by body is 422; nothing makes
one. Older test code changed: only concierge/tests/kit.ts routeStorage (reads a stream body). Full run 1620 passed.
Attack (each PASS or FAIL with numbers):
 1. The stream: a 200 MB stand-in file: the process's memory rise; a store that fails half way (the stored object
    and the file row: nothing half-written is left; the job failed and can be asked again); a temp path OUTSIDE
    the temp folder or a symlink returned by a renderer: is it read and deleted blindly? (a real adapter is ours,
    but say what the job trusts); two jobs at once never share or delete each other's temp file.
 2. Abort and erase: abort before the render starts, mid-render, during the store write; erase during each: no file
    row, no storage object, no temp file, the wish's other files untouched; the erase poll: how often, and does it
    stop when the job ends (no timer left: jest's open handles)?
 3. Time: with RENDER_TIME_LIMIT_SECONDS set to 60 and 3600 the lease follows; a worker that dies mid-render (kill
    the claim: simulate by never finishing): when is the job taken again, and never while the first could still
    write; after 2 tries the job is dead and the person is told what (the wish read's video state) and can ask again?
    Does the changed lease apply to OTHER job kinds (it must not make every job wait 21 minutes after a crash)?
 4. Concurrency: the gate is in-process: with two server processes each would run its own: say so (a note for R6);
    a waiting render whose wish is erased leaves the line.
 5. The migration: applies on a database at the base's head and on a fresh one; the down note; drift and routes.
 6. Nothing sells that includes the video with the live binding (run the round 19 specs); the diff's older-test
    change is only the stream-reading helper. typecheck, the WHOLE lint, gates.sh, check-contracts, check-drift,
    check-routes; the render-jobs, jobs, server-files folders' specs.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r1/VERDICT.md (30 lines or fewer): MERGE or FIX FIRST, findings by severity
with file:line. Drop your databases, remove your worktree. Hand back ONCE in 12 lines.
