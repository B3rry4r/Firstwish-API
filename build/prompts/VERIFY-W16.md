VERIFIER W16 | TIER T1, lean (five small web items) | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w16/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and /home/user/Firstwish-API/build/prompts/W16.md (its cases are the contract); rulings IJ2, IJ4, IJ4a in
/home/user/Firstwish-API/build/rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `w16` (head 061ca22) against its base 3c9089b. Your own detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w16 (the branch) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w16-base (the base) (`npm ci` each), and an API
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w16-api at the API commit in your spawn line; ports 5780-5799; stack prefix vw16; BUILT.
The builder's claims: (1) the server never answers an empty price book (price-admin.service.ts:109-115), so UA-527 is
not a state; Prices.tsx unchanged. (2) a new draft sends no style and the server picks (23 planner and vendor
occasions get a pick inside allowedStyles); a link's style is sent only when its own kinds and occasions list it; a
kind or occasion MOVE in Maker.tsx (268, 275) keeps a web fallback through a new `moving` argument of startStyle,
because the server picks none on a move and refuses the save. (3) makeDraft in w7-api.mjs no longer sends "noir";
w11 makes its own ledger row and passes alone on a fresh stack (67 PASS twice); its empty-state check now runs only
when the screen shows the empty words. (4) at 360 the Table's header is a "Sort by" row of 44 px buttons (Support,
Concierge), the sort in the address, 1440 unchanged; done in styles/admin.css. (5) the poster no longer runs past
the edge (573 and 588 before; styles/site.css, StylePoster.tsx, page.tsx). w16.mjs 17 checks; NOT wired into
drive.mjs. KNOWN: w7 (3 FAIL) and wa6a (1 FAIL) now fail on regexes for "letter" (the server's pick is the style
"letter"); not run at the base; the whole driver NOT run.
Check in a real browser at 360 first (each PASS or FAIL with what you saw):
 1. Claim 1: read the server file; try to get an empty group or book from the real route (a kind filter, a fresh
    database after the seed): true or not.
 2. Claim 2: is the `moving` fallback a second copy of the server's rule again? For a move between kinds and
    occasions (love -> planners, birthday -> apology, vendor occasions): what the web sends, what the server
    answers, whether the draft ends in a style the server offers; a link naming a style the server does not offer
    for that kind; a link naming a premium style on a free start. Any case where Continue is off for good or a
    save is refused with no words: a finding.
 3. Claim 3: did w11's change LOOSEN a check (a check that now runs only sometimes)? Say exactly when it runs and
    whether the old failure could now pass unseen. Run w11 alone on a fresh stack and after w4.
 4. Claim 4: at 360 and 390 on EVERY staff list that uses the shared Table (name them all, not two): tap each
    sort, both directions; the address; reload; Back; keyboard; nothing covered or cut; long column names; dark.
    At 768 and 1440: pixel-compare with the base (unchanged?).
 5. Claim 5: /styles/<slug> pages with public wishes and long names at 360, 390, 1440: 0 side scroll; the poster
    looks the same as the base where it did not overflow (pixel-compare three styles).
 6. w7 and wa6a on the BASE and on the branch: are the 4 failures new with this branch? Name the lines.
Then: tsc, gates (289 accepted, 0 new; scripts/gates and the baseline untouched in the diff), test:client, lint
(warnings against the base), check:css, build; w16.mjs once.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w16/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity
with file:line. Stop your stacks and browsers by PID, drop your databases, remove your worktrees. Hand back ONCE in 15 lines.
