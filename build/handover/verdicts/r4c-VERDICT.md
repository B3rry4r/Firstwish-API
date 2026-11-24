VERDICT R4C: FIX FIRST (merge a770810 onto 2f1cdc8; API 1b8ac63; contracts:check exit 0)
Pictures: .../verify/r4c/pics (all frames), sheets/ (4 frames a style), rc/ (receiver pairs), logs sweep-*.log sweep33.log rc.log checks.log

HIGH
1. An action word drawn in a recorded frame that the sweep calls clean: "Touch the star".
   - stage/tinsel/endings/candle.tsx:238 (not edited by R4C): pics/tinsel_candle-4-ending-s55.png
   - stage/constellation/endings/candle.tsx:166 (and Opening.tsx:400): sheets/constellation_candle.png frame 4 (pics/constellation_candle-4-ending-s55.png)
   Cause: "touch" is not in the seed list and is not inside a Hint or Hush, so r4-words.mjs cannot see it.
2. A drawn send button and reply bar in every group-chat recording: stories/group-chat/Scene.tsx:614-624 (aria-hidden composer: field bar + blue send arrow).
   pics/group-chat_envelope-1-cover-s5.png, group-chat_envelope-2-letter-s40.png (same in the other 4 endings). Not focusable, so the sweep is blind to it.
MEDIUM
3. Empty white pill where text was: pics/group-chat_envelope-4-ending-s200.png (and -2-letter-s40.png, small pill).
4. lullaby candle ending: the "Pull to turn down the light" tag is hidden but the cord line still hangs at the left edge: pics/lullaby_candle-3-ending-s45.png, -4-ending-s55.png.
5. boarding-pass candle ending has "Hold to light the runway" (endings/candle.tsx:363) inside a Press: not seen in my 4 frames, not proven absent.
LOW
6. Pips only a phone holder needs: polaroid-table "04 / 04" pill, mixtape player pill, midnight "I / II", mosaic "02 / 07", status/pidgin story bars.
7. Frames kept per case are 4 not 5 (the page names only cover / letter / ending scenes): "two middle scenes" are one picture.

SWEEP (merged tree, 200 ms): 95 of 95 done and clean (93 in three parts; a session token ended part 1 near 30 min: harvest-light x2 re-run alone, clean). 0 page errors in any case (a pageerror listener was added in a scratch copy r4v.mjs). All endings ran, not 15 picked.
33 ms: harvest-light/envelope (WebGL), letter + its 10 ending scenes, mosaic/names, reel, status, the-aisle/confetti: all done, clean, 0 page errors.
LENGTH (IK6b): whole play, stepped seconds: harvest-light 47, bloom 43, cap-toss 41, first-day 41, group-chat 40; none over 60. Cover + ending phases at most about 14 s (crude: from scene change times). Status plays 36 s at 200 ms but 19 s at 33 ms: the play length depends on the step.
WebGL at 33 ms (harvest-light): 46 s stepped = 1394 frames in 294 s real = 0.21 s a frame (another browser job was running); a 60 s video = 1800 frames = about 6.3 min of stepping, before capture and encoding.
RECEIVER (/w/<slug>, one wish, base 5342 vs merge 5341, 360 and 1440, 12 moments each, tap + drag + wheel): 14 edited-file endings and 6 unedited (cinema/gift, gold-card/close, quiet/envelope, bloom/candle, banter, constellation/candle): control list (role, name, box) and cue text and box identical in every moment except mosaic, status, mixtape at moment 0 (mid-animation opacity or height, differs run to run). Cues seen and kept: Hold then let go, Tap to go on, Pull to turn, Hold the picture, Drag the prints aside, Tap to open, Swipe, Swipe to turn, Tap to continue, Pull (1440 only). Some ending cues (group-chat "Pull down to read", pidgin "Pull am" at 360) were not reached. Pixel pairs differ even on unedited styles (WebGL timing), so pictures are no proof; the snapshot is.
WORD LIST: a cue outside the seed is NOT caught. Checked at the regex on the real list: "Brush the glass", "Rub the lamp", "Touch the star" all MISSED (a rebuilt scratch page was not made). The sweep cannot see: shapes, arrows, send buttons, pips, empty gaps, words in images or canvas, any verb not listed.
CHECKS: tsc 0; lint 863 warnings 0 errors; gates 0 fail (289 accepted); test:client 12 ok; check:css ok. Diff: 18 files (16 style files, r4.mjs, r4-words.mjs); no public/, tsconfig or gate file.
