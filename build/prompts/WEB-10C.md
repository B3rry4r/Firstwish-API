BUILDER WEB-10C | TIER T2 (what a wish holds; the ticket step) | Budget 150 steps. The web reads what a wish holds and which tickets can be bought from the server's round 20; the rules it kept of its own go. Nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started);
never touch scripts/gates/** or the baseline file; final suites in the FOREGROUND; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md; rulings IL1 to IL4 (the END of /home/user/Firstwish-API/build/rulings-phase3.md), IK3a, IK4, IK4a, IJ2, IJ3, IJ4a there,
R10 in /home/user/Firstwish-API/build/rulings.md; the rows of /home/user/Firstwish-API/build/sweeps/web.md that name WEB-10C (the WEB-10B check: M1, L1 to L4; the W16 check: F1).
Work: a new local branch `web-10c` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-10c (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-10c-api at the API commit in
your spawn line; FIRST `API_DIR=<it> npm run contracts:check` (exit 0). Ports 5660-5679; stack prefix w10c; BUILT.
You own: app/app/wishes/[id]/page.tsx and components/app/life/sheets.tsx (the video and the extras only),
components/app/maker/Ticket.tsx, lib/offers.ts (startStyle and its `moving` branch) and its two callers' lines in
components/app/maker/Maker.tsx, the maker's `held` extras (find where `held.adds` is built), one new flow
scripts/live/flows/w10c.mjs and its line in scripts/live/drive.mjs. A shared component: add a prop, never a copy.
Cases (a real browser at 360 first; each a check in w10c.mjs; FIRST show what the head does today):
 1. The wish page learns what the wish holds from the wish read's `adds` (each extra, from its ticket or a
    purchase, a refund's state): the read of GET /payments for that purpose GOES. M1: a failed read of the wish
    shows the page's own failed state with Try again (a paid video is never just missing). L1: an extra whose
    refund was sent or done shows what the server says, never "Send me the video" for a wish that no longer holds it.
 2. The maker's extras: an extra the wish holds (bought, or in its ticket) is shown as held, not offered again
    (today `held.adds` is always empty, so five more photos and the premium style are re-offered). Five more
    photos may be bought again (IL1): say how many it holds. A refused start shows the server's words.
 3. The ticket step draws all four tickets from ONE read, GET /v1/ticket-offers?wish=<this wish> (a person and a
    business alike): prices from it, a ticket that cannot be bought drawn as not available with the server's
    words (`canBuy`, `words`); no second read; L4 gone. L3: a ticket shut for the wish's style or photos says why
    and gives one button to the step that fixes it (the style step, the photos step); nothing stays checked that
    cannot be paid for.
 4. L2: Ask and Ask again cannot send twice from one tap (the handler guards; the server already keeps one job).
 5. lib/offers.ts: the `moving` fallback and every rule of kinds, occasions or levels in startStyle GO: a kind or
    occasion move sends no style and takes the server's pick (IL4); a style named by a link is still sent. Prove
    with the planner and vendor cells the old fallback missed, and a wish holding a ticket.
 6. Focus: after Enter on "Take it as a video" the first Tab stays inside the sheet.
Also 390 and 1440: no side scroll; one light/dark pair per changed state into /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-10c/.
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint`
(863 warnings or fewer), `npm run check:css`, `npm run build`; w10c.mjs twice: 0 FAIL; w10b, w10a, w16, w4-maker1,
w5-maker2, w6-maker3 once: 0 FAIL. Commit on web-10c; do not push; stop your stacks by PID; remove both worktrees.
Hand back ONCE in 10 lines: head; each case before and after; files changed; what was NOT run.
