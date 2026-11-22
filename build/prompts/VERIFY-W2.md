VERIFIER W2 | TIER T1 lean, measured in a browser on a real API stack | Budget 60 steps.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time (a build, a stack, a driver
run: never two), and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w2-site2/NOTES.md as you go. Stop ONLY processes you
started, by the PIDs you recorded. You did not build this. Test, do not trust. You fix nothing. If NOTES.md or your
worktrees already exist, an earlier verifier was lost to a restart: read NOTES.md and carry on.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is
/home/user/Firstwish-API/build/prompts/W2.md; rulings R10, R15 in build/rulings.md; the claims in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w2-site2-claims.txt.
Under test: /home/user/Firstwish-web local branch `w2-site2` (head and base in your spawn line). Your OWN detached
worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w2 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w2-api (API at the commit in your spawn line); stack prefix vw2;
ports 5560-5579; the stack BUILT (`npm run live:up -- --built`, never next dev); verify folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w2-site2/ (pictures in shots/). Run every command with your own worktree as the working directory.
Besides the common list, attack:
 - Styles: switch a style off on the server (staff route) and change one's level: the list and the style's page
   follow after the page's own refresh time (say how long); an off style's page says so and returns the right
   status; "Watch it play" only where the server gives a wish; no fixture or bundled list decides what is on.
 - Now Showing: the gallery equals GET /v1/showing (count, order, creators by handle, the wish of the day); empty
   server = the designed empty state; a card opens the real link; no fixture left in ShowingGallery.
 - Contact: a real send makes ONE thread on the server (double tap, two tabs); the server's limits and words for a
   bad email, an empty and an over-long message, too many sends; the address and WhatsApp shown are R15's.
 - Privacy and terms: the builder's list of sentences that promise more than the code does: check three against
   the API code; confirm no legal sentence was changed in the diff.
 - As a website: JavaScript off (content still there), titles and descriptions, 0 console errors, no sideways
   scroll at 360 and 390, light and dark, 1440; nothing stored in the browser (print storage: R10).
 - Drawn against built: each of the six screens at the base against the branch: any control the base drew that is
   gone (is there a server field for it?) and any control drawn that does nothing.
 - The flow scripts/live/flows/w2*.mjs alone: 0 FAIL; typecheck, gates, test:client EXIT 0; sample 10 ui-align ids
   the builder marks done in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w2-site2-ui-align.txt (SHOW each). Do NOT run the whole driver.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove YOUR worktrees, stack and databases; leave no background jobs.
