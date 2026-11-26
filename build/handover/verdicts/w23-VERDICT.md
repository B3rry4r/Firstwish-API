VERDICT W23 (ruling CP1), T1: MERGE
Head web e27d79a (on 5f9fd26), API e65ad31; stack vw23 BUILT (ports 5740/5741), stopped by PID, db dropped.
1. Staff search at 360/390/1440, light+dark (my own sign-in script, vis.mjs): support "Subject, name or email" needs 172.7 px, room 214 at 360; concierge "Order, sender or name" 170 px, room 214: whole at all 12 combos. Clear button shown with text, clears to "" in all 12 (padding-right 44 with text, 14 without).
   W14B flow (staff4bFlow): 97 PASS, 0 FAIL: wish number finds the thread, order number C-xxxxxx finds that order only, clearing brings lists back, at 390 dark.
2. r4.mjs: reel/default clean (33 s stepped). Plants ON (R4_PLANT) in 21 cases (10 styles + 10 letter scenes + cinema, reel): every one of the 21 cases flags both plants A (cream) and B (gradient). Black plate NOT reaching both sides, in cinema (probe, black 400x300@100,100 with a 14 px grey ring): flagged on head (apart 136), same as base 5f9fd26. Caveat: a black plate with NO standing-out ring on cinema's black is not flagged on head AND not on base (apart<4 rule predates W23), so W23 loses nothing.
3. tsc 0 errors; gates 0 fail/0 warn (289 accepted); lint 0 errors, 770 warnings (<=863); check:css pass; build exit 0.
NOT run: the full drive.mjs, test:client, the other 33 house styles for plants, the real W20 05940e7 flags, the full-width bar with a ring.
Findings: none blocking. Note the placeholder lost the word "wish" (search by wish number still works, server side).
