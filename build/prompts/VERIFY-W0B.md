VERIFIER W0b | TIER T2 identity, full, measured in a browser on a real API stack | Budget 110 steps.
You did not build this. Test, do not trust. You fix nothing. Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/W0B.md (its six cases are the contract), the builder's
claims (in your spawn line), its numbers /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w0b-measure.txt, /home/user/Firstwish-API/.pipeline/conventions.md (auth model,
error envelope), rulings R10, R11 in /home/user/Firstwish-API/build/rulings.md, and
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/frontend-surface-build/SKILL.md (Core laws 2, 4, 8, 9; Phase 5).
Under test: the WEB repo /home/user/Firstwish-web, local branch `w0b-session` (head in your spawn line) against claude/sleepy-mayer-f0hkb8.
Your own worktrees: /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w0b (web, detached at the branch, `npm ci`) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w0b-api (API,
detached at /home/user/Firstwish-API's claude/sleepy-mayer-f0hkb8, `npm ci`); the stack through `node scripts/live/stack.mjs` with API_DIR and
prefix vw0b; ports 5220-5239; a PRODUCTION web build for the measurements. Kill what you start by PID; remove your
worktrees and databases when done. Never a live provider or a production host.
Attack (each PASS or FAIL with what you saw; open your own pictures and say what they show):
 - R10, the owner's rule: after a full sign-in, a reload, welcome saved, a theme change and a sign-out, read localStorage,
   sessionStorage, indexedDB.databases() and document.cookie in the page: all empty at every step (print them); the browser's
   cookie jar holds only the server's httpOnly cookie (print its flags: HttpOnly, Secure or why not on localhost, SameSite,
   Path); grep the built bundle (.next/static) for localStorage, sessionStorage, indexedDB, document.cookie writes.
 - The token: the access token is in no storage, no URL, no DOM attribute, no global a script can list (search window);
   a reload signs in again by the cookie alone; with the cookie deleted a reload shows signed out, not a broken screen.
 - Refresh: with an expired access token, ten calls at once cause exactly ONE refresh call (count requests) and each is
   retried once; a refused refresh ends the session for every caller; no request loops (count calls for 10 s).
 - Codes: wrong code, expired code, a used code, too many tries (the lock), too many asks: the screen shows the server's
   own words for each (quote the server's message and the screen's text side by side); a code for another email does not
   sign in; double tap on the button sends one request; the back button after sign-in does not show the code screen live.
 - Two tabs: sign out in one, the other stops being signed in without a browser store (say how you saw it); sign in as A
   in one tab and B in another: no tab shows the other's name.
 - A banned and an erased account (make them through the API's staff routes on the stack): the server's words, no session.
 - Google: with no client id configured the button is not drawn (no dead control); with a fake id configured it is drawn
   and goes to the server's route (do NOT call Google: NOT RUN against Google).
 - Welcome: details and the theme are saved to the account (read them back from the API, then on a fresh browser profile
   after sign-in the theme is the account's); a choice before sign-in (a kind, a style, a return path) survives the sign-in
   and an open redirect is refused (a return path of //evil.example and https://evil.example lands inside the app).
 - Contract types: change one line of the copied contracts file: the check fails; no response shape typed by hand in the
   files the branch touched (law 4): list any.
 - Width and states at 360x740, 390x844, 1440x900, light and dark: each of the three screens and each state (loading,
   wrong code, locked, signed in): scrollWidth <= innerWidth AND every control inside its own cell (measure each field,
   button and message box against its container's right edge, not only the page); 0 console errors; one light and one dark
   picture per screen and state at 360 into /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0b/shots-verifier/ (the lead and the owner look at these).
 - The live driver: `npm run live:drive` on your stack prints "wired 3 of 89" and really signs in through the screens (read
   it: it must not call the API directly to sign in). `npm run gates` exit 0 with no new finding; nothing else moved:
   `git diff --stat` against the base, name any file outside the brief's scope; lib/account.ts: what still reads it.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0b/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: merge or fix; findings by
severity (blocker, high, medium, low) with file:line and the number or words that failed; what you could not measure.
