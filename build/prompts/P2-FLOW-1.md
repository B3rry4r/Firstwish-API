PATCH P-FLOW-1 round 1 | TIER T1 | Budget 45 steps. Three things from the lead's read of your hand-back; change nothing else.
Your edits to components/app/maker/Maker.tsx and components/app/AppShell.tsx are ACCEPTED into your file map (the
checker will test AppShell on every /app screen). Work: branch `p-flow-1` (8f1d341) in a new worktree at the same
paths, ports 5700-5719, prefix pf1, BUILT; API worktree at the API commit in the lead's message (newer: run
contracts:check; if it differs, `git merge --no-ff claude/sleepy-mayer-f0hkb8` first). NEVER commit tsconfig.json.
 H1 HIGH (your item 5 removed two things that are right). app/app/wishes/[id]/page.tsx:112-115 before your change:
    the video is offered on a RESTING wish (product truth T-49: a resting wish is offered as a video file) and on a
    LIVE wish whose ticket INCLUDES the portrait video (`g.portraitVideo === true`: asking for it is not a
    purchase), or whose ticket may BUY the extra. Only the third is wrong after the wish opens (the server sells
    an extra until the wish opens: 422). Put back the first two exactly as they were; the buy offer alone follows
    the wish's unopened state (draft or sealed); a wish whose video was already asked keeps its status. pf1.mjs
    C-checks: a resting wish offers it; a live wish with the video included offers it and asking works (no
    payment); a live wish that would have to buy it does not offer it; an unopened one may buy it (201).
 H2 the two older checks, now yours: scripts/live/flows/w3.mjs:211 ("a Keepsake can buy it, so it is drawn" on a
    LIVE wish) is no longer true: it becomes two checks: on a live Keepsake the buy offer is NOT drawn; on a live
    wish whose ticket includes the video it IS. scripts/live/flows/pw3.mjs:186-190 asks for the video on "a plain
    live wish": keep every assertion, and make that wish one whose ticket includes the video (or a resting one) so
    the control is there by right. Each flow alone: 0 FAIL twice.
 H3 scripts/live/flows/wa6b.mjs:192 "the first business opens: its name" fails alone on your branch. Run wa6b
    alone on the web head (claude/sleepy-mayer-f0hkb8) too: if it fails there as well it is not yours: find the cause (the
    flow reads early, or the screen is wrong) and say which with the line; fix the flow if it is the flow (it
    joins your file map for that line); a screen bug: report it, do not fix it.
Then the whole driver ONCE on a fresh stack: 0 FAIL (W10 "no picture upload control" may show: not yours). Checks
(quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check, build.
Commit; do not push; worktrees, stack and databases removed. Hand back ONCE in 8 lines: head; H1-H3 with file:line
and the proof; the flows' totals and the driver's.
