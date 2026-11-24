VERIFIER W17 | TIER T1, lean (a shared Sheet's keyboard; the price book read; the pay sheet's recheck) | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w17/NOTES.md. Work ONLY in your own worktrees: never edit, build or reset anything in /home/user/Firstwish-web itself.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and /home/user/Firstwish-API/build/prompts/W17.md (its cases are the contract).
Under test: /home/user/Firstwish-web local branch `w17` (head 46f33a8) against its base cb44ae4. Your own detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w17 (the branch) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w17-base (the base) (`npm ci` each), and an API
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w17-api at API commit 39c6646; ports 5780-5799; stack prefix vw17; BUILT.
The builder's claims: (1) ONE shared Sheet in components/app/ui.tsx traps Tab and Shift+Tab, closes only the top
sheet on Escape, returns focus to the opener, and keeps a stack for sheets inside sheets; the VideoSheet's own focus
effect is gone; tried on the video, pay and a staff (Prices) sheet at 360 and 1440. (2) readBook follows the
server's cursor (24 lines, not 20); the only wrong output before was Ticket's vatIncluded for Signature. (3) when
the recheck shuts the picked ticket no pay sheet opens: the words show, the pick moves, a second tap on Pay opens
the sheet for the new pick at its price; the offers are re-read. It EDITED w6-maker3 F1 (removed a
`sheetPay(b2.page).click()`: the stale second browser now gets the words with no sheet). (4) "WhatsApp" keeps its
capitals; a link style the server refuses shows "That style is not on right now." with the server's words (fixed in
Maker.tsx, outside its file list). (5) a new scripts/live/kit.mjs `passOpening` reads the opening labels from
lib/engine/moment.ts, used by w5b, w7, wa7c, wa6a; w5b 4a proves the voice note is heard (currentTime moves, no
error). NOT RUN by it: a real sheet inside a sheet; w7, wa7c, wa6a after their taps changed; pictures at 390 and
1440; w6-maker3 on the final build. It first edited the main checkout by mistake and reset it (the lead checked: clean).
Check in a real browser at 360 first (each PASS or FAIL with what you saw):
 1. EVERY screen that opens the shared Sheet (list them from the code: person, business, creator, staff): open by
    keyboard, Tab and Shift+Tab ten times each way, Escape, a click outside, focus back on the opener; a sheet whose
    content changes while open (a loading state, an error, the pay sheet moving to its waiting panel): focus is
    never lost to the page behind or stuck on a removed control; scrolling inside a tall sheet at 360; a screen
    reader's view (role, aria-modal, a name). Anything that worked on the base and is worse now is a finding.
 2. The pay sheet (money): the recheck shutting the pick (replay the offers answer, and for real with a second tab
    that buys first or a style switched off): never a sheet for a ticket the person did not choose, never a charge
    without a second deliberate tap, the price in the sheet equals the amount the stand-in is asked for; the
    w6-maker3 F1 edit: read the diff: does the flow still prove the stale browser cannot pay twice?
 3. readBook: 24 lines read; force a 5-line page size (replay) and a failing second page: what the screens show
    (never a half book treated as whole: a missing price drawn as free or absent?).
 4. w7, wa7c, wa6a, w5b, w6-maker3 on the branch once each: 0 FAIL; passOpening against a style whose opening says
    something else (find one in lib/engine/moment.ts): does it pass it; the voice-note check FAILS when the audio
    is blocked (replay the file as 404): prove the check can fail.
 5. The refused-link heading at 360, 390, 1440, light and dark; no side scroll on any changed screen.
Then: tsc, gates (289 accepted, 0 new; scripts/gates and the baseline untouched in the diff), test:client, lint (863
or fewer), check:css, build, contracts:check against API 39c6646 (the branch's copy is one sync behind the head: say
what it reports); w17.mjs once.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w17/VERDICT.md (35 lines or fewer): MERGE or FIX FIRST, findings by severity
with file:line. Stop your stacks and browsers by PID, drop your databases, remove your worktrees. Hand back ONCE in 15 lines.
