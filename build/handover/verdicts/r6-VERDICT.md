# VERIFY R6: MERGE (no HIGH, two MED to log, three LOW)
r6 02b5311 on base 040ec83; web 2f45b9d. T2. Real recorder, web role + render-workers as separate processes, own DB.
## Checks
typecheck, whole lint, scripts/gates.sh, check-contracts, check-drift, check-routes: all EXIT 0.
Folders (TEST_DB_PREFIX=vr6, maxWorkers=2): render-jobs + staff-reads 15 suites 145 tests pass; price-book + purchases + wishes 27 suites 219 pass.
## Findings
MED-1 Server secrets handed to the browser and encoder. chromium-video-renderer.ts:680 (render launch) and :527 (probe) pass {...process.env}; ffmpeg
  inherits too. Seen in /proc/<pid>/environ of chrome and ffmpeg during a render: DATABASE_URL, JWT_ACCESS_SECRET, INTERNAL_TOKEN, RENDER_TOKEN_SECRET (4 of 4).
  Code from R5 (base has it), first live in R6. Not in any log or command line. Fix: pass only PATH, HOME, LANG, TMPDIR.
MED-2 A row held by a worker of ANOTHER machine is freed only by its lease; same-host test is hostname equality (render-jobs.service.ts releaseDeadHolders).
  Two machines with the same hostname (cloned containers) would see each other's live pids as dead and free a live row (a double render). Deploy note: unique hostnames.
LOW-1 leftovers sweep (render-leftovers.ts, age > olderThan) removes a folder AND stops its children even when the owner is alive. Brief wants an old folder of a live
  owner kept. Real renders stay under the limit, but the sweep uses ITS OWN RENDER_TIME_LIMIT_SECONDS: a worker with a smaller limit than its neighbour kills the neighbour's render. Keep one value.
LOW-2 RENDER_RETRY_MS is unused and its comment says a first failure goes back to the queue: it does not. A plain failure is final at once (same as base); only a LOST render gets a second go.
LOW-3 render-read.service.ts: isKnown() reads the database before the address limit is taken, so a flood of well-formed wrong tokens costs one indexed read each, unthrottled. Wrong tokens: 60/min per address (shared "read" bucket, as before), not 30.
## Attacks (numbers)
1 Sold or not: boot log OFF names the part for web origin, secret, Chromium, ffmpeg, ffprobe (each tried). OFF: ticket-offers signature+premiere extra_not_sold, ask 503 video_unavailable,
  pay start signature/premiere/extra.portrait-video 409 extra_not_sold, payment rows unchanged (moment ticket still starts). ON: all four 201. PASS
2 Two workers, 6 real renders: each taken once (6 done, 6 files, losses 0), most at once 2 in total, 1 per worker. Web role with the worker down 30 s: row queued, job attempts 0. PASS
3 Lease renewed (row updatedAt +30 s while frames came). kill -9 mid-render: browser and encoder gone, restart released the row (queued, 1 loss), done once (7 done, 7 files). Foreign id kept 60 s+. PASS
  (twice lost live: NOT re-run; specs r6-worker 2 and 3 pass, builder's numbers show it.)
4 Erase and refund mid-render (refund seeded as grant + sent refund): row failed "render aborted", no stored file (0 before, 0 after), no fw-render in /tmp, read 404. PASS
5 Sweep on a scratch root: child with right pid and wrong start NOT killed; right start, dead owner killed; fresh folder of a live owner kept with its child; reused owner pid cleaned. PASS (but LOW-1)
6 Public link flood (60 ok then 429): right token read 200; wrong tokens 429. PASS
7 Fresh DB migrate OK. DB at 040ec83 with 3 old render rows made by the old code: migrate, losses 0, words null, rows read 200, Ask again 200. PASS
8 Staff cheap check x10: 0 Chromium started; deep check: 6 browser processes once, second call 1 ms (cached). PASS
9 Token/secret: 0 hits in 8 logs of both processes (secret, JWT secret, 43-char token, /render/<token>); no token in any command line. PASS except MED-1 (environ).
## Claims: 1 confirmed, 2 confirmed, 3 confirmed (twice lost not re-run), 4 confirmed, 5 confirmed (LOW-1), 6 confirmed.
NOT RUN: full suite; Studio wish file (W19); owambe; twice-lost live; two machines with distinct hostnames; lease renewal past the first lease (no render outlasts it: limit+30 s).
Setup note: the built web needs API_ORIGIN at BUILD time (rewrites); without it the render page 404s and every render fails. Deploy notes must say so.
