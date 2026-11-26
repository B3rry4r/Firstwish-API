# VERDICT W20 (web 45b38da vs acd5550; API 3af7138): FIX FIRST
Pictures: $S/build/verify/w20/shots (E cases, strip-*.jpg), shots19 (flagged; sheet1-4.jpg). S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad
Checks: tsc 0; gates 0 fail (289 accepted); test:client 12/12; lint 863 warnings 0 errors; check:css ok; build ok; contracts:check 0. Diff = 20 owned files only (no tsconfig, gates, baseline, wired.json, previews).
## E1-E7 (my own 1080x1920 runs, 5 moments, 13 cases all "clean")
E1 group-chat envelope + scratch: CONFIRMED in last frame (bubble open with words; scratch shows the line). PARTLY: scratch frame 1 still has the empty typing pill "..." (shots/group-chat_scratch-1-opening.jpg).
E2 contact-sheet close: plate gone (confirmed), but ending-start frame is a full-screen empty black film frame (shots/contact-sheet_close-4-ending.jpg; same on base) and the last frame holds a round lamp switch on the photo (control-like). REFUTED as "no empty shape".
E3 constellation candle ring gone, envelope eclipse open with line: CONFIRMED. E4 pidgin-gist opened, no arc: CONFIRMED (frame 1 has green typing dots).
E5 mosaic names (no grey plate) and polaroid-table (slip filled at 4 s): CONFIRMED.
E6 boarding-pass: stepper rail and pips gone; BUT a dark empty progress track still sits under the header in both endings (shots/boarding-pass_candle-5-last.jpg, y=75, x 180-900), and a dotted row of approach lights under the runway remains. REFUTED in part.
E7 scrapbook candle photo cards filled: CONFIRMED.
## Findings
HIGH 1: before-and-after close still draws its progress segments along the bottom in 4 recorded frames (shots/strip-before-and-after_close.jpg); opening frame 1 is an empty grey plate with a "+".
HIGH 2: gold-card gift and candle last frames show counters "03 / 03" and "08 / 08" (shots19/gc-top.jpg). The sweep called them only "flat" or clean: its counter check misses them (spaced, small caps).
HIGH 3: real empty shapes in the 19 flagged, listed below; the builder left them unfixed (stated).
MED 4: S misses an empty plate that never held text (plant A flat cream, plant B gradient with border: NOT caught); only a plate that once held text and was emptied (plant C) is caught. S is not "cannot be fooled".
MED 5: "Make a wish, X." / "MAKE A WISH" still drawn on candle endings: status, marquee, midnight, scroll candles (shots19/sheet4.jpg, sheet2.jpg).
## The 19 flagged (last frame, mine)
FALSE flags (16-ish): cinema x4 (black bars; credits show), marquee, reel, midnight candle (hud bar), midnight confetti, owambe confetti (banner "Happy" clipped, curtain), status, letter/balloon (cream page, text shown), milestone envelope+confetti (digit columns).
REAL: lookbook close (mostly empty dark frame, photo top-left), screening close (dark empty stage, no text), tailored gift (blank open book), milestone gift (digits cut mid-roll), gold-card gift+candle (counter, "PEEL" tab). 
## Receivers (13 cases, base vs branch, 360+1440, builder's r4rc tool; controls and cue sets)
All SAME except: scrapbook/candle 1440 "Swipe to turn" = timing flake, not the change: branch vs branch differs run to run (2 runs: one with, one without); base twice without; the hint is Scene.tsx:794 (page 1), file untouched. polaroid-table/envelope 360 and boarding-pass 360/1440 not reached (base the same); boarding-pass candle at 360 with 140 steps + swipes still not reached on both (cause unknown, tool-side or style).
## NOT run
Full 95-case sweep (ran 13 + 19 flagged); pressing each control (only control and cue sets compared); boarding-pass envelope long run; dark/light and 390 views; base-vs-branch 1440 for every moment.
