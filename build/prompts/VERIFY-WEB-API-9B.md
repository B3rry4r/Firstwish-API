VERIFIER WEB-API-9B | TIER T1 lean, measured in a browser on a real API stack | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-9b/NOTES.md (if it exists an earlier verifier was lost: read it and carry on). Stop only PIDs
you started.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief
/home/user/Firstwish-API/build/prompts/WEB-API-9B.md; rulings IF5, IF6, HU2, HU4, R9, R10; the claims in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-9b-claims.txt.
Under test: /home/user/Firstwish-web local branch `web-api-9b` (head and base in your spawn line). Your OWN detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa9b (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa9b-api (API at the commit in your spawn line); stack prefix vwa9b; ports
5660-5679; the stack BUILT (`npm run live:up -- --built`, never next dev). Run every command with your own worktree
as the working directory.
Besides the common list, attack:
 - The friends' link: off then on: the SAME link works for a friend again; voices given before are still listed
   and still count; a friend with the page open while it is off, then on; the 12 cap across off and on; a sealed
   and opened wish; two tabs; a login or a stranger cannot turn it on.
 - A house wish: no Report row anywhere on the link (the menu, the end screen, a deep link to the report sheet);
   a person's wish still has it and it still files a report.
 - "Public wishes in <style>": equals GET /v1/styles/:id/wishes (count, order, paging to the end); never a
   hidden, resting, ended, removed, passcoded or unlisted wish (make one of each on the server); the empty state;
   the server slow and stopped; Now Showing's style filter equals the server's answer for three styles.
 - The site's menus (Nav and Footer) and the Home page's styles row: the builder replaced a hand-picked list with
   "the server's first seven styles that are on": compare every page that drew the old list at the BASE with
   the branch (pictures side by side at 360 and 1440): what changed for a visitor; a style switched off as staff
   leaves the menus within the page's refresh time; with the API stopped the menus still draw (the kept copy)
   and never an empty menu or a crash.
 - The creators page's "four moments": what is drawn with wishes listed and with none.
 - Deleted fixtures: `git grep` for every name the builder says is gone; no page reads a sample wish; nothing
   drawn that links to a wish that does not exist.
 - As a website: JavaScript off, titles and descriptions, 0 console errors, no sideways scroll at 360 and 390,
   storage empty (R10).
 - wa9b.mjs alone 0 FAIL; typecheck, gates, test:client EXIT 0. Do NOT run the whole driver. The builder's driver
   FAIL "L1 an empty moment list says so in words" (p-w5 flow, "Getting the scenes…"): run p-w5 alone twice on
   your stack and say whether it is the flow not waiting for the levels read or the screen stuck on loading.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove YOUR worktrees, stack and databases; leave no background jobs.
