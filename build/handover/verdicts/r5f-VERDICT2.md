# VERIFY2-R5F verdict: MERGE (one LOW finding)
API r5f a810aaf (own worktree, npm ci, built); web 60f235b (next build, fresh `next start` per cold pair); ports 5340/5341. 1080x1920, one epochMs, framemd5.
1. Letter from a COLD web (fresh next start + fresh recorder per run): 6 pairs, 0 differing, each 160 of 160 frames. Pairs with 60 of 160: 0. Pairs with
   160 of 160 differing: 0. One more pair with 3 burners (load 6.6): 0 differing. (Load 3 to 5.5 beside the other job for the six.) 7 pairs, 0 odd.
2. Flag does not break the other styles: polaroid-table 215 frames, 0 differing, done; reel 369 frames, 0 differing, done. 3 frames of each opened
   (h/m-polaroid.jpg, h/m-reel.jpg): prints, canvas photo, reel title/bars all drawn, no blank or frozen frames.
3. r5 spec 38 of 38 three times (load 1.1, 3.8, 7.0 at start: two burners of mine added for runs 2 and 3; the other job was mostly idle).
   Whole render-jobs folder: 14 suites, 123 tests pass, 0 skipped.
4. typecheck 0; whole `npm run lint` EXIT 0; scripts/gates.sh 0; check-contracts, check-drift, check-routes 0.
   Token: no 43-char token-shaped string in the render log lines (18 lines), web log, API log, test logs; every line reads "N frame wait(s) hit the 400 ms cap", all 0.
## Findings
LOW 1. M2 "a spec for both": the spec (r5-chromium-renderer.spec.ts:582-592) forces only the cap count (frameWaitCapMs: 1) and a quiet page's worldsRemade = 0.
  The world-made-again path (chromium-video-renderer.ts:862-870, regex "Cannot find context") has NO test and I did not force it; the builder says so
  (numbers.md). Safe by reading: one retry only, any other error rethrown, a second failure fails the render in words.
LOW 2. The log text says "hit the 400 ms cap" with a fixed 400 even when frameWaitCapMs is set otherwise (cosmetic; :933). numbers.md cites the flag at :682, it is at :687.
LOW 3 (known, IK6l): the rare 160-of-160 kind was not seen in my 7 cold pairs; it stays on the sweep list.
## NOT run
Forcing a mid-render page reload to exercise the remade world; studio and owambe pairs; 15 s cost runs; the full `npm test` suite (CI).
