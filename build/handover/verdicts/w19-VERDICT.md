# VERIFY-W19 verdict: FIX FIRST (one HIGH)
Head f0ded72 on base acd5550; API 3af7138. Diff = 6 files, all owned (W19.md); no tsconfig, gates or baseline.

## Findings
HIGH 1. The letter style's frames differ between two recordings for a cause other than the encoder. letter, 1080x1920, 8 s, one epochMs:
  `-threads 2` 60 of 160 decoded frames differ; scratch recorder with `-threads 1` still 60 of 160 (frames 0-59). Input JPEGs
  (scratch hook dumping every buffer sent to ffmpeg): 24 of the first 26 differ between two runs, then they converge.
  The difference is a moving box x 24-536, y 1072-1728 (up to 24 grey levels, 16-20k pixels a frame): an entrance that is off by a sub-step in
  the first ~1.3 s. Output files come in two sizes (233748 / 231241 bytes) in A B B A order: a race, not a fixed offset.
  Refutes claim 3 for letter ("0 differing JPEGs"). Cause not found (not diagnosed: out of budget); the shim, components/render or letter's first scene.
MEDIUM 2. Studio: threads 2 gives 30 of 160 frames differing (frames 84-113); threads 1 gives 0 of 160 and equal bytes. Encoder only: claim 3 confirmed for Studio.
LOW 3. The builder said stepped-clock.test.mjs is 24 of 24; I count 21 + 1 skipped without --origin and 27 of 27 with --origin=... (all pass).
LOW 4. Claim 4: on the base shim the branch test fails more than 5a-5d: case 5 errors out (window.__vt.frame missing), 6a, 6b, 7a fail (14 pass, 4 fail).

## Confirmed
1 Studio says ready at time 0: recorded 8 s twice, done both times (36-40 s each), not "never ready".
3 owambe 540x960: 0 of 215 differ with `-threads 2`, in a pair run at load 8 to 10 (the other job running); the builder's differing owambe not reproduced (no threads-1 pair run).
2 Receivers (base :5711 vs branch :5701, one wish content, studio, letter, noir, golden; 360 past "Open it" to the end by scroll, and 1440):
  same controls, cue words, canvases, animation names in 16 of 16 moments; /render-clock.js never requested; Math.random native; no window.__vt;
  same chunk count (Studio lazy-loads as before); 0 page errors. Weak: `.is-in` was 0 in every case on both sides (my scroll did not trigger it), so the scroll-style entrance is not shown.
  /render-clock.js served on the branch equals CLOCK_SHIM exactly.
5 Receivers unchanged: Host.tsx not in the diff.
Checks (branch): tsc 0; gates 0 fail (0 new); test:client 0; lint 863 warnings 0 errors; check:css 0; build 0.

## NOT run
Polaroid-table and tinsel (the unseen stage style) recordings; threads-1 pairs for owambe, polaroid and tinsel; the pair of owambe at 1080x1920;
the cause of finding 1; r4.mjs; a receiver check that triggers `is-in`.
