PATCH P-W3b | TIER T2 | Budget 30 steps. Round 2's findings on Home only; a small diff the lead will read line by line.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules) and the round-2 file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w3-app/round2/VERDICT.md.
Work: branch `w3-app` (69d22b7) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w3b (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w3b w3-app`; `npm ci`). Touch only components/app/feed/ShowCard.tsx, its styles, and (if needed for a
type) lib/person.ts. No stack is needed unless you choose to prove it live (then: API worktree at the commit in your
spawn line, ports 5240-5259, prefix pw3b, a built web).
 H1 (high) A feed row whose creator has no handle (the server's own publish writes creator {name} with no handle): no
    "@", no "@undefined", no button that asks GET /creators/undefined: show the creator's name as plain text and draw
    neither the creator sheet's button nor Follow for that row. A row WITH a handle keeps all of it.
 M1 The card draws the row's picture when the server gives one (img not empty, with pos as the base card used it) and
    the creator's name; with img "" it draws the mark as now. Look at the base card (git show c223c96 for the feed
    card) for how the cover, name and counts sat; keep the patch small: no new component family.
 L1 At 360 Open and Play sit on one row (no lone wrapped button).
Prove with a test of the card's logic or a rendered check at 360 (rows: with handle and img; no handle; img ""):
say what you did. Checks (quiet logs, EXIT lines): typecheck, lint, check:css, `npm run gates` (0 fail, no new
finding), `npm run test:client`, `npm run build`. Commit on w3-app; do not push; remove your worktree. Hand back ONCE
in 6 lines: head; H1, M1, L1 closed or not with file:line; `git diff --stat` against 69d22b7.
