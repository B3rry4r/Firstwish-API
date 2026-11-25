VERDICT R5 (verifier, head fc34c82 vs 992efe4): FIX FIRST
HIGH
1. WebSocket escapes the allow-list. chromium-video-renderer.ts:365 (ctx.route does not see WebSockets) and :312 (host rules drop the port):
   from the allowed origin 127.0.0.1:5250 a page opened ws://127.0.0.1:5252 (not allowed) and the server saw the upgrade, uncounted.
   Redis and PostgreSQL listen on localhost here. fetch, img, form, popup, beacon, worker, iframe, css, redirect, ws to an IP not on the list: all blocked.
MEDIUM
2. Abort in Chromium's start window: 2 of ~14 aborts at ~330 ms rejected 29.85 s later (claim: under 2 s). Both children were already dead; the "did not start within 30 s" timer rejected (:332-352). Other aborts 1.3-2.0 s; nothing left behind.
3. Not repeatable: two renders of the same content differ in 147 of 160 frames (real wish pair; PSNR 24 dB first frame, median 66); a probe page differs in all 69. Cause: web stepped-clock freeze() takes vnow from real perf.now and Date from wall clock; adapter :384 only freezes. Counts are equal (438/160).
4. Timer errors are swallowed (web stepped-clock.mjs fire(): catch then setTimeout(throw) re-enters the shim; rAF only console.error): probe throws in setTimeout and rAF gave a handed-out video (70 frames OK). onload errors and unhandled rejections do fail the job. A finding for the WEB.
5. Drift pin is optional (:272): a clock with a 2x step and no pin handed out a half-length video (35 vs 69 frames); with the pin: "drift". R6 must make the pin required.
LOW
6. Allow entry without a port allows every port of that host (:118: web.example:6379 true); default-port origin gives such an entry. The IPv4-mapped metadata form [::ffff:a9fe:a9fe] passes isMetadata (:96) if allow-listed.
7. Crash of an ffmpeg already flushing a scene is ignored until the end of play (:529-531, `finishing`): late failure; spec :293 "crash of ffmpeg" timed out once in the folder run (1 of 3 runs; 2/2 pass alone).
8. Words: same-host navigation fails with "page.evaluate: Execution context was destroyed"; a non-module clock file prints the raw node command line. No token in either.
9. Real-time leaks: Worker timers, requestIdleCallback and <video> play on real time (probe); the render page draws no clip or voice (RenderStage.tsx:48). Film at 360x640 never reached done (240 s cap, 395 s real); it does at 1080x1920.
NUMBERS (1080x1920): 0.20-0.27 s a frame (scroll 438 frames 88 s; film 962 frames 201 s; Studio 438 frames 117 s); Chromium group RSS peak 1.79-1.87 GB, ffmpeg 270-311 MB; 8 s scroll file 189 KB.
LENGTH (8 s ask, never cut before the ending): scroll/Studio 5.33 s (middle scenes dropped), film 12.27 s; at 540x960: cinema 18.13 s (cover 498 f + ending 46 f, the longest found), status 6.53, mixtape 7.17. 10 of 50 styles run; none over 60 s.
JOINS (ask 16 and 10): pts and dts steps all 3000/90000 across 3 and 2 joins, no doubled or black frame, decode clean, frames = seconds x 30, moov at byte 36.
HELD: claims 1, 3, 6 and 4's kill by PID (Chromium killed -9: "Chromium stopped (SIGKILL)"; ffmpeg: "ffmpeg stopped early"; mid-frames abort 1.7 s, join 1.9 s, before ready 2.0 s). Five in a row and two at once: clean. Token on no command line (149 ps scans), no log, no profile hit.
Late photo and font (3 s): a page that waits is ready later with the photo in frame 0; a page ready at once shows it later (adapter trusts ready). Hung photo: fails after 154 s "never ready within 150 s".
CHECKS: typecheck, check-contracts, check-drift, check-routes, gates.sh, whole lint: EXIT 0. render-jobs specs 88 of 89 (item 7). Spec SKIPs with words when Chromium is missing (12 skipped, 4 pure pass).
NOT RUN: the full suite; a 60 s file; 33 other styles; slow photo through the real storage; an allowed name that resolves inside; WebTransport; real fonts host.

Round 2 (verifier, head acc80ec vs fc34c82): FIX FIRST
HIGH
1. M3 does not hold on a real wish. Same name and photo, one epochMs, 1080x1920: 106 of 160 decoded frames differ (idx 0-59 and 114-159; frame 1 PSNR 36 dB, ending 65 dB); with one photo slowed 3 s: 109 of 160. Cause: chromium-video-renderer.ts:681 steps 16 ms per 50 ms of REAL time until ready, so the virtual time of frame 0 follows readyMs (799 vs 593 ms). The builder's stand-in page is ready at once, so its spec passes.
2. Token readable by any local process: Chromium's --remote-debugging-port=0 (:539) listens 127.0.0.1, no secret; /json/list shows http://host/render/<TOKEN>, /json/version gives the ws link (drive the page). --remote-debugging-pipe would close it.
3. Child and port left after a host crash: node SIGKILLed mid-render left the detached Chromium group alive with its debugging port (spawn :547). A foreign orphan (pid 20717, 3 h old, r5job work folder it re-creates) is still here and failed 2 of my 3 folder runs.
MEDIUM
4. A picture that never completes: first frame waits a flat 20 s (34.5 s vs 9.8 s) then the video is handed out as good without it (:687-692).
5. The proxy has no secret: another local process reached the listed hosts through it during a render (GET 404, CONNECT 200); unlisted port, :5432, metadata refused 403. Closed after render (ECONNREFUSED).
LOW
6. Raw words: "write EPIPE" (ffmpeg killed, events.once drain, :819), "page.evaluate: Target page, context or browser has been closed" (Chromium -9 late). 7. Blocked count is noise (66-85 a real render: Chromium's own google.com calls). 8. Web shim throws in a sandboxed iframe (navigator.serviceWorker): render fails.
HELD: H1 every kind (ws/wss incl. same host:port, fetch, xhr, SSE, beacon, img, preconnect, prefetch, prerender, iframes srcdoc/blob/data, Worker gone in every frame, WebRTC TURN/STUN 0 candidates, WebTransport rejected): server hits 0, UDP 0; proxy CONNECT matrix, mapped/decimal/hex/fd00 metadata, rebinding (one lookup), 2 MB header 431, 200 idle tunnels. M2 24 of 24 in 12-279 ms (14 at ~330 ms), nothing left. M4 3 of 3, M5 11 cases plain words (454-912 ms), L7 0.3 s, L8, joins/moov/video-only/frames=sec x 30, 5 in a row + 2 at once, token on no command line, kill -9 of both children. Real wish with web+API only: renders, photo in frames. Owambe 5 s at 540x960 done (343 s, ready 12 s); golden, marquee 34 s.
CHECKS: typecheck, check-contracts, check-drift, check-routes, gates.sh, whole lint EXIT 0; render-jobs 104 of 104 once (run 2), runs 1 and 3 failed only on the foreign orphan's folder. NOT RUN: full suite; a hostile clock that passes the check.

Round 3 re-check (VERIFY3-R5, verifier, r5 e5a56ad merged onto ccr-91b3ed11-fx445c 7318cd3): MERGE
VERDICT3 R5 re-check (verifier, r5 e5a56ad merged on ccr-91b3ed11-fx445c, whose head was 7318cd3 not 79c74fe; merge clean): MERGE
No finding. HIGH 0, MEDIUM 0. Own probes (old ones lost), 360x640, 8 s ask, stand-in web on 127.0.0.1:5400-5403.
H2 HELD. During a render lsof shows no listening socket owned by the Chromium group (only node: web stand-in and proxy). curl sweep of every listening
   port (/json/list, /json/version, /json, /; 6 ports) found the token 0 times and no DevTools answer. /proc cmdline+environ scan: token, secret, base64 login: 0 hits.
H3 HELD. node child SIGKILLed mid-render (Chromium + 3 ffmpeg running): chromium/ffmpeg gone at +2 s (1 left at +1 s); listening ports back to the 4 pre-existing; no proxy port.
M4 HELD. Hung picture and hung font: render FAILED at 31.2 s and 31.0 s (30 s limit plus ~1 s browser start): "a picture or a font did not finish loading
   within 30 s". Picture slowed 3 s and 10 s: video done (8.0 s, 15.0 s), frames 0, 50, 100 all red (240,0,1). Font slowed 3 s: done.
M5 HELD. No secret: GET listed host 407, GET unlisted 407, wrong secret 407, CONNECT listed 407, CONNECT unlisted 407. With the secret (read from the child): CONNECT
   listed 200, CONNECT :5432 403, CONNECT 169.254.169.254 403. Plain-http render needs the login to load at all and succeeded. Not seen: a real https site (no cert stand-in).
L HELD. ffmpeg killed: "ffmpeg stopped early (killed): " (no EPIPE; trailing ": " is cosmetic, chooseScenes/plainWords path unchanged).
   Chromium killed: "Chromium stopped (the pipe closed)" (no "Target page"). Blocked count 0 on 8 clean renders (was 66-85); no leftovers after either kill (own filter).
ONCE: ws to another port of the same host (5402) and ws to the same port (5401): 0 connections, 0 upgrades seen. Abort at 330 ms x5: rejected 50-84 ms after abort.
CHECKS (EXIT 0 each): typecheck, whole npm run lint, gates.sh, check-contracts, check-drift, check-routes. render-jobs folder twice: 111 of 111, 12 suites, both runs (181 s).
NOT RUN: full suite; frame-for-frame repeat on a real wish (IK6h moved it); Studio wish; a real https/CONNECT through the browser; 60 s file; other styles; hostile clock.
NOTE: a foreign chrome-headless-shell (node scripts/live/flows/r4.mjs, pid 7461) ran beside me; not mine, left alone.
