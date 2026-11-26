# VERDICT W20 round 2 re-check (web 5423978 vs base acd5550; API 08e9913): MERGE
Pictures: /tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad/build/verify/w20r2/shots (8 cases x 5 frames, 1080x1920), sheet0.jpg, sheet1.jpg, last4.jpg, bphead.jpg, screening.jpg; sweep8.txt, sweep10.txt; receivers.md; checks.log
Checks: tsc 0; gates 0 fail (289 accepted, none new); test:client 12/12; lint 863 warnings 0 errors; check:css ok; npm run build ok. Diff acd5550..5423978: only components/styles/** and scripts/live/flows/r4*.mjs.
## Named findings (all opened by eye, seeded with 3 photos)
H1 first-day/gift last: card "A gift, from all of us.", no PEEL (shots/first-day_gift-5-last.jpg) CLOSED.
H2 first-day/scratch: no "1 / 2" in frames 2-5, last frame "Happy birthday, name", no foil (shots/first-day_scratch-*) CLOSED.
H3 tailored/gift: no ruler or marker in frames 2,4,5 (shots/tailored_gift-*) CLOSED.
M1 boarding-pass both endings: last frame header holds words only ("FINAL APPROACH", "ON THE WAY"), no empty cells (bphead.jpg) CLOSED.
M2 contact-sheet/close and lookbook/close ending-start frames (-4-ending) hold a picture and words CLOSED.
M3 pinboard/gift last: gold flaps open, card "A GIFT, FROM ALL OF US." CLOSED.
## Sweep (plants OFF): 8 named cases 8 of 8 clean (sweep8.txt). 12 cases on 10 untouched styles (gold-card x2, constellation, mosaic, polaroid-table, pidgin-gist, group-chat, milestone x2, scrapbook, screening, invitation/candle = no such ending): 10 clean; 1 flag screening/close "thin bar that fills" = REAL (DOM bar; not in a frame), in IK8e's W22 list, not a W20 defect.
## Receivers (base vs branch, one API and seed, 360 and 1440): 9 cases, 18 visits: controls, cue words, boxes SAME in all. Ending not reached in 4 visits (boarding-pass candle and envelope, both widths; 41 moments, base same).
## LOW: boarding-pass middle frames still show "01 THE LETTER / 1A" flip cells (stop number and seat; shots/boarding-pass_candle-2-middle.jpg); first frame near-black in first-day, tailored (opening, as r1). Not counters of the wish; owner may rule.
## NOT run: pressing controls (r4rc.mjs here has no press step; builder's p2w20-rcp.mjs not committed); plants ON; boarding-pass 360 ending; dark/light.
