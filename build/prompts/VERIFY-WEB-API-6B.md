VERIFIER WEB-API-6B | TIER T2 full with the money attacks (a plan is paid here; logins are identity) | Budget 110 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-6b/NOTES.md (if it exists an earlier verifier was lost: read it and carry on). Stop only PIDs
you started.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief
/home/user/Firstwish-API/build/prompts/WEB-API-6B.md (with its ADDED notes); rulings HR1, HR2, HR4, HR5, HU5, HY1, HZ3, R10 in
build/rulings.md and rulings-phase3.md; the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-6b-claims.txt.
Under test: /home/user/Firstwish-web local branch `web-api-6b` (head and base in your spawn line). Your OWN detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa6b (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa6b-api (API at the commit in your spawn line); stack prefix vwa6b; ports
5640-5659; the stack BUILT (`npm run live:up -- --built`, never next dev). Run every command with your own worktree
as the working directory.
Besides the common list, attack (identity and money first; read the server after each):
 - A login: every business page and every control a login can reach: each either works for a login or is not
   drawn (a control drawn that the server refuses is a finding: list the request and its 403); a login removed
   while their tab is open (every page: the words, no loop, no stale data shown as theirs); a login of business A
   who is the owner of business B: switch back and forth: no request for B carries A's id or the reverse (read the
   x-business-id of EVERY request during ten switches, with two tabs open on different businesses); what a reload,
   a second tab and a deep link to /app/pro/... show (the builder keeps the pick in memory: a deep link into the
   second business after a reload must not show the first business's data under the second's name).
 - With a second business open the builder does NOT draw People and the plan's pay controls: what exactly is
   said, and can a person still pay for or manage the wrong business by a typed address or the back button?
 - Plan (HR1, HY1, HZ3): two tabs and two browsers paying at once; the owner's "Start again" on a login's waiting
   payment; a late paid one after the drop (refund due, the server's words, the plan not applied twice); the
   lapse by the server's clock; the return (HR2) names the payment; nobody is charged twice with one plan.
 - Import (HR5): 500 rows with 20 bad and 5 doubles; a file of 5,000; a file that is not a CSV; the same file
   twice; a double tap on "Add anyway": the counts on screen equal the database every time.
 - Logo: a 20 MB file, a renamed .exe, an SVG with a script, a lost connection mid-put then Try again, two tabs
   uploading at once: one logo, the server's words, nothing executable is ever served back to the page.
 - The flow wa6b.mjs alone on a FRESH stack: 0 FAIL; w8.mjs alone (the builder moved 3 of its check strings: are
   the new strings what the screen and the server really say?); typecheck, gates, test:client EXIT 0; the six
   screens at 360 and 1440, light and dark: no sideways scroll, 0 console errors, storage empty (R10): the pick of
   a business must NOT be kept in the browser's storage.
 - Do NOT run the whole driver (another agent is running it on the merged head).
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove YOUR worktrees, stack and databases; leave no background jobs.
