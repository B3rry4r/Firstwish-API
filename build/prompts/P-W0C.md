PATCH P-W0c | TIER T1 | Budget 30 steps. Two controls are wider than their column on a 360 px phone. Fix and measure.
Read /home/user/Firstwish-API/build/common-rules.md and the two pictures the lead looked at:
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/shots-verifier/pro-wishes-dark-360-open.png (the "New client wish" sheet: the date control beside the occasion
choice runs off the right edge; its calendar icon is cut) and pro-people-light-360-open.png (the two date controls side by
side: the right one ends about 9 px past the right edge of the Team and Phone fields below it).
The page's scrollWidth was fine in both, so the page-level check did not see it: a control wider than its own cell.
Work: the WEB repo /home/user/Firstwish-web: commit on local branch `w0c-rules` (8d97b86) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w0c (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w0c w0c-rules`; `npm ci`); ports 5140-5159; a production build is not needed (dev server). Touch only
components/app/pick.tsx, styles/app-pick.css and the two-column rows' CSS of the screens that use the controls.
 1. Every one of the six controls can shrink to its cell (min-width 0 on the control and its text; the text shortens with an
    ellipsis or a shorter date wording at narrow widths: "23 Nov 2026" before "Mon 23 Nov 2026"); the icon is never cut.
 2. Measure with Playwright at 360x740 and 390x844, in every screen and sheet that uses a control (the list is in
    /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w0c-measure.txt): for each control, its getBoundingClientRect right edge <= its parent cell's content-box right
    edge and <= the viewport width less the page's side margin; its left edge >= the cell's left; no child of the control
    is clipped (scrollWidth <= clientWidth on the control). Write the table (screen, control, control right, cell right,
    pass or OVER) to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w0c-measure.txt: every row must pass.
 3. One dark and one light picture at 360 of the "New client wish" sheet and of the People "Add" sheet, each with its date
    control closed (so the row is seen whole), into /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/shots-patch/.
Checks (quiet logs, EXIT lines): typecheck, lint, check:css, `npm run gates` (exit 0). Commit on w0c-rules; do not push;
remove your worktree; kill what you started by PID. Hand back in 6 lines: head; the rows that were OVER before and their
numbers after; the picture paths.
