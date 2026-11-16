VERIFIER WEB-API-4 | TIER T2 full, measured in a browser on a real API stack | Budget 130 steps. Machine: 4 CPUs, 15 GB;
a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is
/home/user/Firstwish-API/build/prompts/WEB-API-4.md (its ten cases are the contract); rulings HN1, HN2, HO7, HK1, HM6, HP1-HP13 in
/home/user/Firstwish-API/build/rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `web-api-4` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-web-api-4 (web)
and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-web-api-4-api (API at the commit in your spawn line); stack prefix vwa4; ports 5480-5499; verify
folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-4/ (pictures in shots/). The stack can move time (STANDIN_CLOCK_OFFSET) and receives
uploads (the stand-in put). This bundle changed the SHARED modules every other screen uses: a regression anywhere in
the 37 wired screens is this bundle's.
Attack (identity and sessions first):
 - One client, two sessions (HN2): the person's and the staff's sessions in one browser at once: a staff 401 never
   refreshes or ends the person's session and the reverse (count refresh calls per route); sign out of one, the
   other stays; ten calls with an expired token: one refresh per session; a refused refresh ends only its own
   session; neither token is in any store, URL, DOM attribute or global; the caller's `headers` option can never
   overwrite Authorization or the Idempotency-Key (try both through the receiver's link code and by reading the
   client; `npm run test:client` has a case for it); every exported name other bundles import still exists with the
   same call shape (list any signature that changed and who calls it: grep the branches w5-maker2, w8-business1,
   w1-site1 in /home/user/Firstwish-web for callers).
 - No-session words (HM6): a first-time visitor on sign-in, sign-up and the staff sign-in sees no notice; an erased
   and a banned account's reload shows the server's words; a signed-out reload shows nothing false.
 - Roles from the server (HP1): for each of the 7 staff roles and a two-role member: the shell's sections and each
   screen's controls equal the session's `sections`; change a role's sections in the database: after the next
   refresh the shell follows with no code change; which client role tables remain (file:line) and for what.
 - Team (HP7, HP8): a change carries the version it read; two staff changing one member: the second sees the
   server's words and the fresh row; removed staff are not listed; the staff sign-in sentence (HO7) for an address on
   the team, not on it, and over the limit: the same sentence each time; the Audit filters list every section and
   every staff member the Team read gives this role.
 - Staff screens: a held photo is drawn for moderator, ops and owner (the picture really loads from the signed url)
   and nothing for other roles; an expired url is refetched, not stored; the day picks for today and 6 days ahead
   show after a reload and a day cannot be picked twice by mistake; a due month offers Mark paid from a list, a
   month not due does not; the people search finds by wish number.
 - The person's app: wish cards and wish detail show the owner's own pictures (upload real photos through the
   maker's API calls or the API directly: ready, screening, refused each as the server says); a url past ten minutes
   is refetched; nothing of a picture in a browser store; Video is asked only when the wish read says there is one
   (0 console errors on a plain live wish); a heart and a save survive a reload and a second profile shows only its
   own; a published row with a creator handle and a cover draws both, one with no handle draws the name only.
 - Casts: every cast left in lib/person.ts and lib/admin/w13-api.ts, with the contract type it should have used or
   the API request beside it.
 - The live driver: `npm run live:drive` on ONE fresh stack runs every merged flow (auth, W3, W4, W7, W11, W12,
   W13 and this bundle's) to the end, twice in a row, with no planted sign-in code (codes come from the file
   STANDIN_MAIL_OUTBOX names) and each flow touching only its own data: totals, any FAIL, the "wired N of 89" line.
 - Regression sweep of the 37 wired screens at 360 on the built web: each opens signed in as the right actor with
   real data, 0 console errors, storage empty (a table: screen, status, errors); pictures only where something
   looks wrong.
 - `npm run gates` (0 fail, no new finding; stale baseline ids), typecheck (0 errors with the new contract file),
   lint, check:css, test:client, build, contracts:check against your API worktree.
