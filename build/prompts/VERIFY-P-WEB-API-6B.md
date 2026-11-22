VERIFIER P-WEB-API-6B (re-check of a patch) | TIER T2 (logins are identity) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-6b/round2/NOTES.md (if it exists an earlier verifier was lost: read it and carry on). Stop
only PIDs you started.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md and the first check's files /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-6b/VERDICT.md and NOTES.md
(findings 1-6).
Under test: /home/user/Firstwish-web local branch `web-api-6b` (head in your spawn line; the patch is the commits after d85669b). Your
OWN detached worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa6b2 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa6b2-api (API at the commit in your spawn line);
stack prefix vwa6b2; ports 5640-5659; the stack BUILT (`npm run live:up -- --built`, never next dev). Run every
command with your own worktree as the working directory.
Re-check ONLY these, in a browser on the stack, reading the network:
 F1 (was HIGH): as a LOGIN of a business: People is drawn nowhere (the tab bar at 360, the side bar at 1440, the
    Overview, the switcher's menu, the You page); the typed address /app/pro/people says in plain words it is not
    for a login and sends no request the server refuses; then tap EVERY control on every business page a login
    can reach (not only load the pages: open each sheet and press each action that does not pay) and list every
    response of 401 or 403: there must be none. The same person as OWNER of another business still has People.
 F2 (was HIGH): the import sheet with 5,000 pasted rows, with a row holding control characters, with an empty
    paste, with a file that is not a CSV: the server's words on the sheet each time (with the line number when the
    server names one), the database count unchanged, and a good import after a refused one still works.
 F3 (was MEDIUM): the business line in the switcher and on You for an owner on each plan and on a pack, and for a
    login: it never names a plan the server did not serve (the builder now says "Business" or "Business · Login":
    is the plan's name still shown anywhere it was designed to be, from the server's read?).
 F4: a removed login on a client wish page gets the removed words. F5, F6: read the two flow changes: the w8 check
    now finds at least one link; the wa6b logo check waits on the state.
 Then: wa6b.mjs alone on a FRESH stack: 0 FAIL; w8.mjs alone: 0 FAIL; typecheck, gates, test:client EXIT 0; the
 People page and the import sheet at 360 and 1440: no sideways scroll, 0 console errors, storage empty (R10).
 Do NOT run the whole driver.
Hand back ONCE in at most 12 lines: verdict (merge / fix first), each F with PASS or FAIL and file:line, new
findings by severity. Remove YOUR worktrees, stack and databases; leave no background jobs.
