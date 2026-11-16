VERIFIER P-W0c | TIER T1, measured and LOOKED AT | Budget 30 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md and /home/user/Firstwish-API/build/prompts/P-W0C.md (the contract).
The fact that brings you here: the builder reports 0 controls wider than their cell after its fix and says the date button
now reads "23 Nov 2026"; but the pictures it saved (/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/shots-patch/wishes-dark-360-closed.png and
people-light-360-closed.png: open both with the Read tool first) still show "Mon 23 Nov 2026" cut at the right edge in the
"New client wish" sheet, and in "Add a person" two date controls overlapping and cut. Either the pictures are from before
the fix or the fix does not reach the rendered page. Find out which.
Under test: the WEB repo /home/user/Firstwish-web, local branch `w0c-rules` at c859800 (the patch) on 8d97b86. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pw0c (detached at c859800; `npm ci`); ports 5200-5219; a PRODUCTION build (`npm run build`, `next start`; save and
restore tsconfig.json). The app shell pages need an account held in the browser: /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/measure.js shows how the
builder seeded it. Kill what you start by PID; remove your worktree when done.
 1. On your fresh build, at 360x740 and 390x844, dark and light: open the business "New client wish" sheet (/app/pro/wishes,
    the add button), the People "Add" sheet (/app/pro/people), the Vault "New shoot" form and reveal/new: take a picture of
    each with the date control CLOSED into /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/shots-recheck/ and then OPEN THE PICTURES YOURSELF (Read tool) and
    say what you see for each: is any control cut, overlapping its neighbour, or past the right edge of the fields below it?
 2. Measure each control on those sheets: its right edge against its own cell's right edge and against the right edge of
    the full-width field above it (the "Who it is for" or "Name" input); the text shown in the date button; whether two
    controls' boxes intersect. A table, every row PASS or OVER with the numbers.
 3. Read the patch (`git diff 8d97b86 c859800`): does its CSS selector match the element the sheets really render (compare
    with the DOM you see)? One line on why the builder's measure could pass while the page is wrong, if it is.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0c/VERDICT-P.md (15 lines or fewer). Hand back in 10 lines or fewer: merge or fix; what each picture shows;
the OVER rows with numbers; file:line of the cause.
