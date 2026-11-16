VERIFIER W0c | TIER T1 lean, measured in a browser | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/W0C.md (its five cases are the contract),
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/frontend-surface-build/SKILL.md (Core laws 2, 6, 7, 8; Phase 5; references/measurement.md), and the builder's numbers
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w0c-measure.txt and pictures /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/shots/.
Under test: the WEB repo /home/user/Firstwish-web, local branch `w0c-rules` (head 8d97b86) against claude/sleepy-mayer-f0hkb8 (a06fa93). Your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w0c (detached at the branch; `npm ci`); ports 5200-5219; run a PRODUCTION build (`npm run build` then
`next start` on your port; save and restore tsconfig.json), not the dev server; no API is needed. Playwright is on this
machine. Kill what you start by PID; remove your worktree when done.
The builder did NOT measure: light mode numbers, a disabled control, touch, a production build. Those first.
Check, each PASS or FAIL with the numbers:
 - Each new control (Choice, Combo, DatePick, TimePick, ColourPick, Range in components/app/pick.tsx) on each screen that
   uses it, in a phone profile with touch (Playwright's devices: a 360x740 Android and a 390x844 iPhone): tap opens, tap
   picks, tap outside closes, the popup stays inside the screen (its right and bottom edges against the viewport), the page
   does not scroll sideways while it is open, a drag on Range moves the value; then by keyboard on a desktop profile: Tab
   reaches it, Enter or Space opens, arrows move, Enter picks, Escape closes and focus returns, Tab order continues.
 - States, measured in light AND dark: text and border contrast against the surface at rest, on hover and on focus (focus
   ring against its surface at least 3:1; hover change visible: at least 1.3:1 against rest or a visible border change);
   a disabled control (find one a screen really disables, or say none exists) cannot be opened and reads as disabled.
 - Names a screen reader gets: each control has a role and an accessible name (read the accessibility tree for one of each).
 - Values: pick a date, a time, an option, a colour and a range on a real form and read what the form holds: yyyy-mm-dd,
   hh:mm, the option's value, #rrggbb, a number; 29 Feb in a leap year and not in another; the earliest and latest a form
   allows (a date of birth in the future, a seal time in the past: what the form did before must still hold: compare with
   the base branch on two forms).
 - No native control is left: `npm run gates` (0 fail) and your own grep for <select, <datalist, type="date|time|color|range".
 - Width: all 15 website routes and every changed screen at 360, 390 and 1440 on the production build, with web fonts
   loaded AND blocked: scrollWidth <= innerWidth on every row; the home page's sign: its width against its wrap at 360.
 - The three handlers now named NOBODY_LISTENS: for each, can a person reach a control that calls it (tab to it, tap it in
   the maker's ways preview and the Studio layout picture)? If yes it is a dead control (HIGH).
 - Copy: "sideways" is gone everywhere in customer copy; the two Studio lines read naturally (quote them); no emoji left;
   no other copy changed (`git diff` for strings).
 - Nothing else moved: `git diff --stat` against the base: list any file that is not a control swap, the CSS for it, the
   copy lines or the handlers; pictures: one light and one dark at 360 of each changed screen with a control OPEN into
   /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/shots-verifier/ (the lead and the owner look at these).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/VERDICT.md (30 lines or fewer). Hand back in 15 lines or fewer: merge or fix; findings by severity
(blocker, high, medium, low) with file:line and the number that failed; what you could not measure.
