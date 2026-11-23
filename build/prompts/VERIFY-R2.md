VERIFIER R2 | TIER T1, lean (a recording script moved into a shared module) | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r2/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/R2.md (its cases are the contract), task R2 and sections 0 and 2 of /home/user/Firstwish-API/build/tasks/RENDERER-PLAN.md, and R9 in
/home/user/Firstwish-API/build/rulings.md ("leave the preview videos quality as is").
Under test: /home/user/Firstwish-web local branch `r2` (head 906012c) against its base 8299dcb. Your own detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r2 (the branch) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r2-base (the base) (`npm ci` each; a production
build, `next build` + `next start`, on ports 5660-5679). Chromium: /opt/pw-browsers/chromium; ffmpeg: /usr/bin/ffmpeg.
Recordings go to your verify folder, NEVER into public/previews.
The builder's claims: scripts/lib/stepped-clock.mjs now holds the clock shim, the frame loop and the ffmpeg encode
(exports CLOCK_SHIM, installClock, freezeClock, createFrameLoop, encodeVideo, ffmpeg, probeSeconds); previews.mjs calls
it; frame counts equal head's (golden 288, cinema 356) but frames are NOT identical, and head against head differs
just as much (run-to-run noise: the real-time wait before the freeze sets the virtual start), so "no change of
behaviour" rests on counts and on equal noise; a 3 s run at 1080x1920 is h264, 30 fps, 90 frames, 3.000 s, 12.2 s of
work, Chromium peak 720 MB; nothing under public/ changed.
Check (each PASS or FAIL with numbers):
 1. Read the diff: is anything in the shim, the freeze or the frame loop DIFFERENT in behaviour from the base's
    inline code (order of injection, what is frozen, the step size, the settle wait, capture format and quality,
    ffmpeg arguments, two-pass, loop fade)? List every difference, however small.
 2. Record two styles with the base and with the branch (one scroll, one film; one LANDSCAPE style too if previews
    have one): frame counts, durations, file sizes; a picture-likeness score between base and branch (ffmpeg ssim or
    psnr on the decoded videos) BESIDE the same score for base against base: is branch-vs-base inside the base's own
    run-to-run spread? Look at six frames of each side by side (start, opening, middle, a transition, end): the
    same moment at the same frame number, or shifted?
 3. Is the run-to-run difference real noise or a fault the move could hide (a frame captured before the page
    settled, a blank or half-painted frame, the fallback poster)? Count blank or near-uniform frames in each.
 4. The module alone at 1080x1920 for 5 s on one style from a scratch script: ffprobe (size, fps, codec, length),
    time taken, Chromium peak memory; does `run({seconds, done})` stop on `done` and on abort without leaving a
    Chromium or ffmpeg process behind (ps before and after, by PID)?
 5. `git diff 8299dcb..906012c --stat`: only scripts/previews.mjs and scripts/lib/**; nothing under public/, app,
    components, lib, styles; tsc; gates (289 accepted, 0 new); lint warnings against the base.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r2/VERDICT.md (30 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line; and one line for the renderer's builders: is the clock good enough to cut a video at a whole scene at 30
and 60 seconds, or must the freeze become deterministic first (say what would have to change). Stop your servers
and browsers by PID, remove your worktrees and recordings (keep the numbers and six frames). Hand back ONCE in 12 lines.
