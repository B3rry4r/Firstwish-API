VERIFIER R4 | TIER T2 (a page that shows a wish's content with no gate; it changed the shared player), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTED ONCE TODAY: ONE heavy job at a time, in the foreground, only when `free -g` shows 6 GB or more; never pkill, killall or
pgrep -f (stop only PIDs you started); never edit, build, checkout or reset anything in /home/user/Firstwish-web or /home/user/Firstwish-API themselves;
notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4/NOTES.md (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, /home/user/Firstwish-API/build/prompts/R4.md and R4B.md (their cases are the contract), sections 1 to 3 and 8 of
/home/user/Firstwish-API/build/tasks/RENDERER-PLAN.md, rulings IK6, IK7, IK4a (the END of /home/user/Firstwish-API/build/rulings-phase3.md), R9, R10 in /home/user/Firstwish-API/build/rulings.md.
Under test: /home/user/Firstwish-web local branch `r4` (head 80a83e2) against its base 67ff8bf. Your own detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r4 (the branch) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r4-base (the base) (`npm ci` each), and an API
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r4-api at API commit 7123170; ports 5660-5679; stack prefix vr4; BUILT; stand-ins only.
The builder's claims: a new route app/render/[token] and components/render/**; the page reads E-289 ONCE in the
browser (a module-level promise for each token), stores nothing, sets no cookie, is noindex, no-referrer, no-store;
the server HTML holds nothing of the wish; the web log holds no token; `window.__render` = {ready, scene, sceneName,
done, error}; a scroll style, a film (landscape played upright), a creator Studio style (dressed from the one read: 0
style-document requests), a passcode wish and a title-card opening each ran ready to done at 1080x1920 with no
scroll bars; 5 s clips are h264 1080x1920; a used or unknown token shows a plain error page. SHARED PLAYER FILES
CHANGED: components/engine/Host.tsx (props auto, upright, given), StudioHost.tsx (takes `given`), played() moved to
lib/engine/adapt.ts, fromStyleFiles shared in lib/style-files.ts; next.config.ts (a headers entry for /render/*);
scripts/live/stack.mjs (makes the token file fresh at 0600, passes STANDIN_RENDER_TOKENS and STANDIN_VIDEO=hold to
EVERY stack). r4.mjs 58 PASS twice. ITS OWN "NOT MET": the style's ending still draws its own controls ("Blow out the
candle", "Or blow into the microphone", a "Make one" link); only a title-card opening has an animated opening; real
fonts not measured (Google Fonts blocked here); the whole driver not run; a 60 s length not run. Chromium sends the
web origin as Referer on CSS background and font fetches.
Attack in a real browser (each PASS or FAIL with what you saw; a wish's content shown without a live token, or a
token leaving the page, is a BLOCKER; a change to what a RECEIVER sees at /w/<slug> is HIGH):
 - No regression for real people: because Host.tsx, StudioHost.tsx, adapt.ts and style-files.ts changed, compare
   base and branch at /w/<slug> for a scroll style, a film, a creator Studio style, a passcode wish, a countdown
   and a resting wish, and the maker's preview and the public style pages: pixel for pixel at 360 and 1440 (same
   moment), the same requests, the same gate; whw-style flows that exist for them (wa7c, w7, wa6a, w10a) once each.
 - EVERY stack now starts with STANDIN_VIDEO=hold: does anything that worked before wait up to 120 s now (the wish
   page's video ask on a normal stack: w10b, w10c: how long "being made" lasts and whether those flows still pass
   and in what time)? That would be a HIGH for the harness; say the numbers.
 - The token: where it can leak from the page: document.referrer of every request (list each request's Referer),
   the History API, a console line, an error overlay, a source map, the Next.js router cache or prefetch, a service
   worker or the PWA's cache (the site is a PWA: does its worker see /render/*?), window.name, the page title; open
   /render/<token> in a normal tab AFTER use, with a wrong token, with a token of another wish: only the plain page.
 - One read only: React development mode, a reload, Back and Forward, two tabs at once: the second is the error
   page and the first still plays; the read is never retried.
 - No controls (the brief's case 2): list EVERY focusable or clickable thing and every piece of chrome drawn at any
   moment from ready to done in each style you run (the ending's buttons, links, a footer, a sound button, a menu,
   a keep offer, a share): each is a finding with file:line.
 - Fit and time: 1080x1920 exactly; under the stepped clock (scripts/lib/stepped-clock.mjs) from the page's start:
   ready, the scene counter at each whole scene, done 1.5 s after the ending; a film of 32 s against the 30 s cut
   (what would a recorder cut at); the page with the clock NOT frozen (a person's tab): does it still not leak.
 - The headers on /render/* in the BUILT app (curl -I): Referrer-Policy, Cache-Control, X-Robots-Tag; robots and
   the sitemap do not list it; nothing links to it.
Then: tsc, gates (289 accepted, 0 new; scripts/gates and the baseline untouched in the diff), test:client, lint (863
or fewer), check:css, build, contracts:check against API 7123170; r4.mjs once.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line. Stop your stacks and browsers by PID, drop your databases, remove your worktrees. Hand back ONCE in 15 lines.
