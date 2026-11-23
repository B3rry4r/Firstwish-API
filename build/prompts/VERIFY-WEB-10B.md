VERIFIER WEB-10B | TIER T2 (a paid extra; a receiver's secret), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes as you go to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-10b/NOTES.md (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, /home/user/Firstwish-API/build/prompts/WEB-10B.md (its cases are the contract), rulings IK1 to IK6 with IK2a, IK3a, IK4a
(the END of /home/user/Firstwish-API/build/rulings-phase3.md), HP5, IJ3, IJ3a there, R10 in /home/user/Firstwish-API/build/rulings.md.
Under test: /home/user/Firstwish-web local branch `web-10b` (head c180825, made from af3e031) against claude/sleepy-mayer-f0hkb8 (cdea613). Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w10b (`npm ci`) and an API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w10b-api at the API commit
in your spawn line; ports 5660-5679; stack prefix vw10b; BUILT; stand-ins only. ANOTHER stack of the lead is running a
long test on ports 5400/5401 (prefix leadrun): never touch it. Probes under the verify folder, not in the repo.
The builder's claims: a wish that holds the video never shows the price: not asked = one button; being made = words,
no button, the page reads the wish every 5 s while the sheet is open (at most 120 times); ready = Download that
fetches a fresh address at each tap; failed = Ask again (one job, one payment). The offer only when `extrasOpen` is
true; 409 and 503 show the server's words. After a refund the Download tap gets the server's 404 words and the sheet
drops ready. The passcode note once before the ask or payment. Ticket step: a refused start (409 extra_not_sold)
shows the words, shuts that ticket, moves the pick to Moment; GET /ticket-offers is pre-read only for a business
account. A seal's 422 for a missing secret shows the words and one button back to the opening step. Back/Forward in
the maker now re-checks the secret (the guard compared by key). lib/draft.ts has no cast. w10b.mjs 59 PASS twice.
DISCLOSED AS NOT RUN: "not sold", the 503 and the 409 start were the server's words REPLAYED through page.route (the
stack cannot switch the renderer off); the failed state was a database row, not a STANDIN_VIDEO=fail stack; a
business account's /ticket-offers read; a real staff-approved refund of the extra; the whole driver. The page learns
"the extra was bought" from GET /payments because the wish read sends no `adds`.
Attack in a real browser at 360 first (each PASS or FAIL with what you saw):
 - Money (a second charge or a paid thing withheld is HIGH): every way the price can come back for a wish that holds
   the video (a Signature ticket, the bought extra, after a reload, in a second tab, while the payments read is
   slow or failing: what does the page show while it does not yet KNOW: the price?); double tap on Ask and on Pay;
   Ask again twenty times fast; the page after the stand-in webhook lands late.
 - The states for real: a stack started with STANDIN_VIDEO=fail (failed, then Ask again on a normal stack is not
   possible: say what you could do); being made with the sheet closed and reopened, the tab hidden for a minute
   (does the 5 s read stop when hidden or the sheet is closed? count the requests), ready then the address after 11
   minutes (a fresh one at the tap), Download on a phone-size window really saves the stand-in's file.
 - A real refund of the extra through the staff routes (not a database row): sent, done, failed: what the page
   shows at each, and that it never shows Download with the money gone.
 - The ticket step with a business account (the pre-read) and a person (no pre-read): the refused start; the pick
   moving to Moment: was anything charged or sealed; the person's style or photos above Moment's level: what then?
 - The seal's 422 back to the opening step: with a passcode opening and none set (make it by clearing the secret
   through the API after the opening step); Back and Forward across every step after the secret is cleared in
   another tab.
 - 390 and 1440, light and dark, keyboard only; no dead control; nothing stored in the browser (R10).
Then the checks: tsc, gates (289 accepted, 0 new; scripts/gates and the baseline untouched in the diff), test:client,
lint (warnings against the base), check:css, build; w10b.mjs and w10a.mjs once.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-10b/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity
with file:line. Stop your stacks and browsers by PID, drop your databases, remove your worktrees. Hand back ONCE in 15 lines.
