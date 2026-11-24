VERIFIER R5 round 2 | TIER T2 (the real video recorder: its fix round; a proxy the adapter owns is new) | Budget 80 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more (another browser job runs here); tests ONLY through `npm test -- ...` or
`npm run test:affected -- ...` with `--maxWorkers=2` and TEST_DB_PREFIX=v2r5 on EVERY test command; never pkill, killall or pgrep -f (stop only PIDs you
started, Chromium and ffmpeg children too); never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves; no single
command over 8 minutes; no `rm -rf` inside a loop; notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r5/NOTES2.md.
Read /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r5/VERDICT.md (round 1) and NOTES.md (its probes: reuse them); /home/user/Firstwish-API/build/prompts/P-R5.md
(the fix round's cases); rulings IK6b, IK6d, IK6e, IK6f (the END of /home/user/Firstwish-API/build/rulings-phase3.md); `git diff --stat fc34c82 acc80ec` (3 files, +638/-89).
Under test: local branch `r5` head acc80ec of /home/user/Firstwish-API (base of the round: fc34c82). Your own detached worktrees: API
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-r5 (`npm ci`, `npx prisma generate`) and web .../build/wt/v2-r5-web at web commit 2f1cdc8 (`npm ci`,
`next build`, `next start`; read only). Ports 5360-5379. Chromium /opt/pw-browsers/chromium; Playwright installed globally (install nothing); ffmpeg, ffprobe in /usr/bin.
The patch's claims: H1 Chromium runs through a proxy the adapter owns (allow-list by host AND port; a name that resolves to the metadata address
refused; plain-text tunnels refused); ws and wss closed by routeWebSocket; Worker and SharedWorker removed from the page; WebRTC closed by
--webrtc-ip-handling-policy=disable_non_proxied_udp; WebTransport by --disable-quic and the proxy; context.route stays as the second gate and counter;
metadata blocked in IPv4, mapped IPv6, decimal, hex, octal, fd00:ec2::254. M2 an abort at any moment of the start rejects in under 2 s (35 of 35).
M3 the same wish twice with one epochMs: 0 of 160 frames differ (frozen from the first script; the first frame waits for fonts and pictures; stepped
time moves only while no request is in flight). M4 a throw in a stepped timer or frame callback fails the render. M5 the clock comes from
RENDER_WEB_ORIGIN/render-clock.js each render (256 KB cap, JavaScript type, no redirect), no web code imported or run by node, a blank-page
self-check ("clock drift"), 540 to 1140 ms. L7 a dying ffmpeg fails at once. L8 plain words. NOT run by it: a real wish with the allow-list
holding only the web and API origins; the full suite.
Attack (a reachable inside address, a leaked token, a child or a listening port left behind, or a broken video handed out as good, is HIGH):
 1. H1, your round-1 probe first (ws to another port of the same host): nothing arrives. Then the proxy itself, a
    new part: what address and port does it listen on (loopback only? a random port?), can ANOTHER local process
    or another render use it as an open proxy (try from curl while a render runs), does it need a secret, is it
    closed after the render, after an abort, after a crash (ss -ltnp before and after each); CONNECT to a listed
    host on an unlisted port, to 127.0.0.1:5432 and :6379, to a listed NAME that resolves to 127.0.0.1 or to the
    metadata address (resolve then connect: is the resolved address the one connected to: a rebinding try with two
    answers), a plain-http absolute-URI request, a huge header, a slow client (does one stuck tunnel hang the
    render?), IPv6 literals. WebRTC with a TURN-over-TCP candidate; a <link rel=preconnect>, a dns-prefetch, a
    prerender; fetch from a page-made iframe with srcdoc and from a blob: worker (is Worker really gone in every
    frame, and does removing it break any style: render ONE WebGL style (owambe) and two others through the adapter
    for 5 s at 540 x 960: done or the page's words).
 2. The real-wish case nobody ran: a real wish through the adapter with the allow-list holding ONLY the web and
    API origins and the stand-in storage host: it renders, its photos are in the frames, blocked count and hosts.
 3. M3: the same real wish twice with one epochMs at 1080 x 1920: decoded frames equal? And with a photo slowed
    by 3 s on ONE of the two runs: still equal (the claim: stepped time moves only while no request is in
    flight)? A request that never ends (a stream, a long poll): does the render hang forever or fail with words
    inside the time limit? How much real time does the "no request in flight" rule add to a render?
 4. M2 (your round-1 method, 14 tries at ~330 ms, and 10 more at random moments up to 5 s): under 2 s each; the
    process table and temp folder after. M4, M5, L7, L8: one probe each with your own page or file, not the builder's spec.
 5. Round 1's passes still hold: joins even, moov first, video only, frames = seconds x 30, five in a row and two at
    once clean, the token on no command line or log (the proxy's log too), kill -9 of each child.
 6. typecheck; the WHOLE lint; scripts/gates.sh; check-contracts, check-drift, check-routes; the render-jobs folder three
    times (104 tests claimed). Do NOT run the full suite (if your session refuses a command, do not retry and ask
    nobody: say NOT RUN).
Verdict appended to VERDICT.md under "Round 2" (25 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line. Stop what you
started by PID; remove both worktrees and recordings (keep a few frames and the numbers). Hand back ONCE in 14 lines.
