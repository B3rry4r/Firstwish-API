VERIFIER R5 | TIER T2, full (the real video recorder: it opens a wish with a secret token and runs a browser on the server) | Budget 110 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more (another browser job runs on this machine); tests ONLY through
`npm test -- ...` or `npm run test:affected -- ...` with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you started, Chromium and
ffmpeg children too); never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves; no single command
over 8 minutes; quiet logs ending in an EXIT line; notes to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r5/NOTES.md as you go.
Read /home/user/Firstwish-API/build/common-rules.md; /home/user/Firstwish-API/build/prompts/R5.md (its six points are the contract); /home/user/Firstwish-API/build/tasks/RENDERER-PLAN.md;
rulings IK6, IK6a, IK6b, IK7, IK7a (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Under test: /home/user/Firstwish-API local branch `r5` (head fc34c82; two files: src/modules/render-jobs/chromium-video-renderer.ts and its spec)
against its base 992efe4. Your own detached worktrees: API /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r5 (`npm ci`, `npx prisma generate`) and
web /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r5-web at web commit 88bcd46 (`npm ci`, `next build`, `next start`; read only). TEST_DB_PREFIX=vr5;
ports 5240-5259. Chromium /opt/pw-browsers/chromium; Playwright is installed globally (install nothing); ffmpeg and ffprobe in /usr/bin. Tokens: the
stack's stand-in token file (IK7). The builder's numbers and six frames are in the verify/r5 folder (do not overwrite: write yours beside them).
The builder's claims (each PASS or FAIL with numbers): 1 a fresh Chromium of exactly the asked size, clock frozen from the first script, frames
over CDP to ffmpeg's pipe, never pictures on disk; 2 the clock is the web's own file by RENDER_CLOCK_PATH, RENDER_CLOCK_SHA256 pins it ("drift");
3 scenes are segments joined at done; opening and ending whole, middle scenes dropped middle-most first; crf 23 capped 1800 kbps; 4 abort kills
both children by PID in under 2 s and leaves nothing; the token masked everywhere; 5 hosts by allow-list, the metadata address always blocked,
blocked requests counted; 6 h264 High yuv420p, the asked size, 30/1, video only, moov first, fw-render-<jobId>-... in the temp folder.
Attack (a leaked token, a reachable inside address, a child left running, or a broken or blank video handed out as good, is HIGH):
 1. Sameness: render one scroll wish twice (8 s): the frame count is equal and the frames match (hash the decoded
    frames; say how many differ and where). Does anything in the page still run on real time (CSS animations, Web
    Animations, requestAnimationFrame, a <video> or a clip inside a wish, performance.now, timers set before the
    shim)? A wish with a clip or a voice: what does the video show at that scene?
 2. Late pictures: slow one photo's response by 3 s (a proxy or a route in your own probe): is the photo IN the
    frames, or was the scene recorded before it arrived? The same for a font. A photo that never answers: what
    happens (words, a time limit: never a hang without end, never a video with a hole handed out as good)?
 3. Length: an 8 s ask on scroll, film, a Studio wish, and two more styles: never cut before the ending; which
    scenes were dropped; how far over the ask a file can go (IK6b: opening and ending stay whole: REPORT the
    longest opening + ending you can find; over 60 s would be a finding). Joins: timestamps rise evenly across
    every join (ffprobe -show_packets), no doubled or black frame at a join, the whole file decodes with no error
    (`ffmpeg -v error -i f -f null -`), frame count = length x 30.
 4. Abort and failure: abort before ready, mid-frames, during the join; kill -9 Chromium; kill ffmpeg; a page that
    navigates away; a page that never sets ready; five renders one after another; two at once. After EACH: the temp
    folder, the profile folders and the process table (no zombie, no orphan Chromium helper), and the rejection's words.
 5. Safety: from a probe page served on the allowed web origin try: http://169.254.169.254/, another port on the
    same host (is the allow-list by host or by host AND port? Redis and PostgreSQL listen on localhost here), a
    file:// address, a redirect from an allowed host to a blocked one, a WebSocket, a DNS name that resolves to an
    inside address, a form post, a download, window.open. Each blocked and counted? The token: search every log
    line, error, ffmpeg argument, and `ps` output during a render (is the address with the token on any command
    line?), and the profile folder after a crash.
 6. Timer errors: the builder says the web's clock shim swallows an error thrown in a timer callback. Prove it with
    a probe page: does the render fail, or is a video handed out? (A finding for the web if handed out: say so.)
 7. The drift pin: one byte changed in a copy of the clock file: with the pin, "drift"; without it, what protects?
    Chromium, ffmpeg or the clock file missing: the adapter fails with words; its spec SKIPS with words.
 8. typecheck; the WHOLE lint; scripts/gates.sh; check-contracts, check-drift, check-routes; the render-jobs folder's
    specs. Do NOT run the full suite (the lead's merge check runs it; if your session refuses a command, do not
    retry and ask nobody: say NOT RUN).
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r5/VERDICT.md (35 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line, and the numbers (time a frame, memory peaks). Stop every process you started by PID; drop your databases; remove both worktrees and
your recordings (keep a few frames). Hand back ONCE in 14 lines.
