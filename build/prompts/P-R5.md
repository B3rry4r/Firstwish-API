PATCH R5 round 1 | TIER T2 (the real video recorder) | Budget 110 steps. Close the named findings of the check. No wiring to production (R6). Nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you started, Chromium and ffmpeg children too); never edit, build, checkout or
reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves; no single command over 8 minutes; quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md; /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r5/VERDICT.md and NOTES.md (the findings and
the probes: reuse them); rulings IK6b, IK6d, IK6e, IK6f (the END of /home/user/Firstwish-API/build/rulings-phase3.md); build/prompts/R5.md (the contract).
Work: the local branch `r5` (head fc34c82) of /home/user/Firstwish-API in your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-r5
(`git worktree add <path> r5`, `npm ci`, `npx prisma generate`); TEST_DB_PREFIX=pr5; ports 5220-5239. A web worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-r5-web at the web commit in your spawn line (it HAS the clock's new arguments and /render-clock.js:
read scripts/lib/stepped-clock.mjs's header; `npm ci`, `next build`, `next start`; read only). Chromium /opt/pw-browsers/chromium; Playwright is
installed globally (install nothing); ffmpeg, ffprobe in /usr/bin. Do not edit a gate or a baseline; no wire change; no registry reopen.
Cases (a test for each, marked to SKIP with words where Chromium or ffmpeg is missing; FIRST show it failing on fc34c82):
 H1 (IK6d). From a page on the allowed web origin: ws:// and wss:// to another port of the same host, to an allowed
    host, to any host: never connects (the listening server sees nothing), counted as blocked; the same for WebRTC
    (no candidate leaves: a STUN try to a local UDP port sees nothing) and WebTransport. The allow-list matches host
    AND port (an entry without a port = the scheme's own port only; web.example:6379 is refused when only
    https://web.example is listed). The metadata address in IPv4-mapped IPv6 and decimal forms is blocked even if
    listed. Say HOW it is enforced for every kind of request Chromium can make (if a route cannot see a kind, close
    that kind at the browser's own switch or run the browser through a small proxy the adapter owns: your call:
    say why) and list each kind tried.
 M2. An abort at any moment of Chromium's start (try 0, 100, 200, 300, 400, 600, 900 ms, five times each) rejects
    in under 2 s with "render aborted"; nothing left behind.
 M3 (IK6f). The clock is frozen from the first script with the request's wall time (a new optional field on the
    adapter's options or the request: epochMs; default the job's start to the second): the same wish rendered
    twice with the same epochMs: every decoded frame equal (hash them). Use the web clock's new arguments.
 M4 (IK6f). A page that throws in a stepped timer or frame callback fails the render with the page's words (the
    web's clock now raises it as a page error: prove it through the adapter; no video is handed out).
 M5 (IK6e). The clock's page script comes from RENDER_WEB_ORIGIN/render-clock.js at each render (size cap 256 KB, a
    JavaScript type, inside the allow-list; RENDER_CLOCK_PATH stays as an override for tests and RENDER_CLOCK_SHA256
    as an optional pin); NO code fetched from the website is imported or run by node: the frame loop is the
    adapter's own (if it imports the web's module today, stop: say what you replaced). Before recording, the
    self-check in a blank page: k steps move Date.now and performance.now by exactly k steps and fire the frame
    callback k times; a clock with a 2x step, a clock that does not freeze, a clock that is not JavaScript: "clock
    drift", no file. The self-check's cost in ms.
 L7. An ffmpeg that dies while flushing a scene fails the render at once (not at the end of play); the spec
    "crash of ffmpeg" passes 10 of 10 in the folder run.
 L8. A same-host navigation and a broken clock file fail with plain words (no raw command line).
(Item 9 of the verdict is the website's; the film at 360x640 goes to the sweep list: do not chase it.)
Prove again after the fixes: scroll, film and a Studio wish for 8 s at 1080x1920 (ffprobe, time, memory), and the
abort, wrong-token and blocked-host cases of the first hand-back.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
render-jobs folder's specs three times; do NOT run the full suite (if your session refuses a command, do not retry
and ask nobody: say NOT RUN). Commit on r5; do not push; stop what you started by PID; remove both worktrees and
recordings; drop your databases. Hand back ONCE in 12 lines: head; H1, M2 to M5, L7, L8 each with its test and
before/after; how each kind of request is closed; the numbers; what was NOT run.
