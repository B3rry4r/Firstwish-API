VERIFIER P-B15 re-check | TIER T2 | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings XX1-XX3, SA1-SA5 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b15/VERDICT.md, and /home/user/Firstwish-web/lib/studio.ts lines 560-700 with lib/occasions.ts (the web's checks and recipes).
Under test: local branch `p-b15` (head a1c44f6) against `b15-studio` (000caa5): `git diff b15-studio p-b15` is all you check.
Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb15 (detached at p-b15; `npm ci`); ports 4840-4849; TEST_DB_PREFIX=vpb15; a clock in 2192; remove
both when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-b15.
Check by id, each PASS or FAIL with what you saw:
 SA1  accept racing withdraw, return racing withdraw, the checks job racing withdraw and racing a decide: 30 tries each: no
      500, no deadlock in the database log, the end state is one of the allowed two, one audit row per decision. The builder
      says an accept then a withdraw takes the live style down with 200: say whether wishes already made in it still play.
 SA2  the eight checks against the web's: build five style documents the way lib/studio.ts builds them (a clean one, and ones
      that break chapters, readable, smooth, holds) and run both the web function (import it with ts-node or copy it into
      your spec unchanged) and the server's on each: the same pass or fail per rule. Then the six differences the builder
      kept (holds and touch as keys; a file not ready fails; a piece's skipped checks pass; a missing scene set; kind names;
      no orientation "both"): for each say whether a style that passes in the Studio screen could fail on the server (a
      finding) or only the reverse. The generated recipes equal lib/occasions.ts today (diff them).
 SA3  ten rubbish AI answers: 502, credits back once, nothing saved; a good one saves; the save's new shape rules refuse
      nothing the web app writes today (feed it the clean document).
 SA4  erase a creator with an accepted style used in a wish: the wish still plays; no name, handle, email or typed brief in any
      table (scan); the catalogue shows the style with no person.
 SA5  a wish cannot pick a held, returned or off Studio style (422) and one already made keeps playing; PATCH on a style in
      review and on a live style is 409: say whether a creator can still take their live style off (withdraw) and edit a
      returned one.
 XX2  a request waiting 4m59s is left, at 5m it is failed and the credits come back once; a late answer after the sweep gives
      no second give-back and saves nothing; 20 sweeps at once.
 XX3  Open's 3 credits once, whichever code makes the row first, also with both at once; a bought pack then adds on top.
 Also: the first verdict's "held" list still holds, and the diff stays in src/modules/studio plus the one style check in
 wishes.service.ts and the row-making step in purchases/creator-handlers.ts (and the tests the rulings force).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules/studio
src/modules/styles src/modules/wishes src/modules/purchases src/modules/accounts` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b15/VERDICT-P.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
