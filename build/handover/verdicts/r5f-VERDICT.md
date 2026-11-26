# VERIFY-R5F verdict: FIX FIRST (one HIGH)
API r5f f4c8776 on 76bf11b; web 3c9b8e6 (built, next start). Load 6 to 9 for the recordings (the other job running).
## Findings
HIGH 1. Letter is still not repeatable from a COLD web. 1080x1920, 8 s, one epochMs, a fresh `next start` before each pair, a fresh recorder per run,
  framemd5: 11 cold pairs: 6 gave 0 differing, 3 gave 60 of 160 (frames 0-59), 2 gave 160 of 160 (frame 0 differs, up to 105 grey levels, lower half).
  Dumping every JPEG sent to ffmpeg (scratch hook in my dist copy, two pairs): ALWAYS the first recording after the web start is the odd one; the
  second recording is the same state in every pair (hash 43eff532...), the cold one is another fixed state (365e1a54...): 24 of 120 input JPEGs
  differ (frames 1 to 25 only, the SAME 24 in both pairs), box x24-536 y1072-1720 (the letter card sits a little higher/turned), up to 52 levels;
  fonts and pictures are settled before (first-loop: two equal shots at k=0), so it is not a font or image decode. It is an entrance that starts
  by real time on the first load of the web (cold bundle/compile). The builder's "later pairs 0" is true only because the web was warm: confirmed
  claim "a cold first load", refuted claim "0 differing" for a fresh web. Cause not pinned (web: letter scene entrance, or the recorder's frame 0
  choice at chromium-video-renderer.ts:868; not diagnosed). A deploy or restart of the web makes the first video differ from the next.
MEDIUM 2. realFrames (chromium-video-renderer.ts:847-852): the 400 ms cap resolves silently (no log, no count), and the world is made ONCE (:843).
  Proven with a small run ($S/build/verify/r5f/h/world.cjs): after reload or navigation Runtime.evaluate in the old world THROWS "Cannot find context
  with specified id" at once (not world 0, not a silent skip): the next shot fails and the render fails with words. Today no page navigates after
  ready, so it is safe, but a page that reloads (a service restart of the web mid-render) fails the wish; the fix: recreate the world on error.
  A busy main thread does not trip the cap either (the timer shares the thread: 1457 ms measured).
LOW 3. numbers.md "Part 5: see the hand-back" is not in the repo (the claim 404/410 is only in prose).
## Confirmed
3 `npm ci` + `npm run build` in a clean worktree: `npm run start:render-worker` logs "playwright-core loads" and recorded a real wish; no hand link needed
  (playwright-core 1.63.0 is in package.json). Note the worker started by npm leaves a node child: stop it by the listener PID.
4 Studio proof through two processes (web role + render-worker, RENDER_ADAPTER=chromium, built web): ask 200, done in 52 s, download 200 video/mp4
  559562 bytes, h264 yuv420p 1080x1920 30/1 14.57 s (437 frames), other account GET 404 and POST 404. Frames: studio-1..3.jpg here.
  (First two tries failed with "storage refused the file (403)": my stand-in storage dir was missing in the env, not the code.)
  Render read claim: render-token.ts consume (:63-80): 404 never-issued or malformed, 410 used/expired/ended; read service 404 only for a wish not live
  or refunded: matches the claim by reading; not forced by a run.
5 Token: no 43-char token-shaped string in the API web log, the worker log, or the web logs (grep).
5 Checks (my worktree): tsc 0; whole `npm run lint` EXIT 0; scripts/gates.sh 0 (all ok); check-contracts, check-drift, check-routes 0;
  src/modules/render-jobs: 14 suites, 122 tests pass (r5 and r6 specs included, 4 load).
## NOT run
Letter pair while a burner loads the machine on its own (the cold pairs ran at load 6-9 beside the other job); the M3 spec 3 times at load 9 to 13;
studio/reel/owambe/polaroid pairs; 15 s cost runs; the cause of finding 1; frames of the 160-differ pairs beyond frame 0.
