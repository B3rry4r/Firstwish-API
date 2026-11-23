PATCH P-WEB-API-7C round 1 | TIER T2 | Budget 70 steps. Close F1-F4 from the check of the creator style at a wish's link; change nothing else.
ONE heavy job at a time; commit per finding; NEVER commit tsconfig.json; stop only PIDs you started; final suites
in the FOREGROUND; hand back once, nothing left running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, WEB-API-7C.md (same folder; its file map is yours, plus the files named
below), rulings IJ1, IJ2 in /home/user/Firstwish-API/build/rulings-phase3.md and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-7c/VERDICT.md.
Work: branch `web-api-7c` (f49a703) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-7c (`npm ci`). FIRST
`git merge --no-ff claude/sleepy-mayer-f0hkb8` (the head in your spawn line; scripts/live/drive.mjs: keep both sides, `node
--check`). API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-7c-api at the API commit in your spawn line; contracts:check exits 0.
Ports 5660-5679; stack prefix wa7c; BUILT; start the stack with
STANDIN_SCREENING=hold:held,reject:refused,reject:bigpic:too-large in the environment.
 F1 THE GATE (`npm run gates` fails: 3 new fake_data findings in components/engine/Preview.tsx). IJ1: the creator
    style's preview adds NO use of the sample wish. Put components/engine/Preview.tsx back exactly as the head has
    it (no `kind` prop, no new sampleWish call). In the maker a creator style is previewed with the wish being
    made (its own photos and words; a wish with no photo yet draws the style's own fallback frames); on the
    public style page it plays with no photos (the fallback frames). Both are marked as a preview in words. Then
    `npm run gates` shows the SAME findings as the head: 0 new (do not touch scripts/gates/** or the baseline).
 F2 MEDIUM components/app/maker/Maker.tsx:409 with StylePick.tsx (Maker.tsx joins your file map for this): Continue
    is active for a creator style the wish's kind is not offered it for (set by hand: the tile is hidden, Continue
    works). ONE rule decides both the tile and Continue: the style is offered by the server for this kind AND its
    level is one this ticket allows (IJ2), for house and creator styles alike. Remove the dead
    `startsWith("studio:")` arm (the server stores `studio-<id>`). If the server accepts the wrong choice by
    PATCH (it does today for the kind: another task fixes the server), the screen still does not continue.
 F3 MEDIUM the public page of a creator style scrolls sideways at 360 and 390 (scrollWidth 376 and 391): a plain
    poster in `.poster-row six` (components/site/StylePoster.tsx:15,21) is 187 wide in a 155 cell. Fix it for the
    creator poster without changing a house style's page (measure both at 360, 390, 1440, light and dark).
 F4 the checker's whole driver had 2 FAILs in W8 (brand saved; brand after reload) that pass alone: run w8.mjs
    alone on a FRESH stack on this branch once: 0 FAIL, or find the cause.
wa7c.mjs carries the new checks (the maker preview shows the wish's own first photo; the style page plays with no
sample name or photo: grep the page text for the sample people's names; Continue by kind and by ticket). wa7c.mjs
alone on a fresh stack: 0 FAIL twice; w5-maker2.mjs alone: 0 FAIL; then the whole driver ONCE to the end (give it
over 4200 s): totals; a FAIL outside your files: rerun that flow alone and report both.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check,
build. Commit; do not push; stack down, databases and both worktrees removed. Hand back ONCE in 10 lines: head;
F1-F4 with file:line and the proof; the gate's count against the head's; the flows' totals and the driver's.
