BUILDER WEB-API-7B | TIER T2 (a payment start, uploads) | Budget 60 steps. Finish what the first WEB-API-7 builder left at its budget; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed item; stop only PIDs you
started; run final suites in the FOREGROUND and hand back once, with nothing left running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, the first brief WEB-API-7.md (same folder; its file map is yours, plus
lib/studio.ts for item 3) and ruling IF1 in /home/user/Firstwish-API/build/rulings-phase3.md.
Work: the EXISTING worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-7 (branch `web-api-7`, head 3b1b03e, clean; read `git log
--oneline d99117c..HEAD` first) and its API worktree .../build/wt/web-api-7-api: move that to the API head in your
spawn line (`git checkout --detach <sha>`, `npm ci`, prisma generate), then `API_DIR=<it> npm run contracts:check`
in the web worktree (if it differs: contracts:sync and commit the contract file). Ports 5660-5679; stack prefix
wa7; the stack BUILT fresh at the head (`npm run live:up -- --built`), the old one is down.
 1. Case 9 (IF1), coded but never run: the Studio payment start sends `returnPath` = the screen's own path; with
    the stand-in the person comes back to that screen and the result is read there. Prove paid, pending and failed
    in wa7.mjs. Find the Concierge order's payment start in the web (grep the payment start calls): if it is in
    the first brief's file map or lib/studio-api.ts, do the same; if it is elsewhere, name the file and line in
    the hand-back and leave it.
 2. Build at the head, then wa7.mjs ALONE on the fresh stack: 0 FAIL, twice in a row. The flow leaves the price
    book and limits as it found them.
 3. lib/studio.ts FILE_MAX (400 KB) and BUDGET (2.5 MB) are stale local limits: the limit a file is checked
    against, and the words said, are the server's (the price book's limit lines the uploads already use); no
    second number in the web. Prove an over-limit file's words equal the server's figure after staff change it.
 4. Not measured by the first builder: every changed screen (Studio editor with the Files panel, its sheets,
    Creator pages, staff Prices) at 360, 390 and 1440, light and dark: no side scroll, no control outside its
    cell; hover and focus on the new controls; one light/dark picture pair per screen.
 NOT yours: case 7's receiver side (a creator style playing at a wish's link) waits for the server; leave
 lib/style-files.ts as it is.
Then the whole driver ONCE on a fresh stack. Known on the head and NOT yours: p-w5 "L1 an empty moment list" and
w5-maker2 "styles on screen"; any other FAIL: rerun that flow alone and report both.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check,
build. Commit; do not push; do not edit .pipeline-ui/wired.json, scripts/gates/** or a baseline; say why
tsconfig.json was changed by the first builder (and undo it if nothing needs it); stack down, databases removed,
both worktrees removed LAST (after your commits are on the branch). Hand back ONCE in 10 lines: head; items 1-4
with file:line and the proof; the flow's two totals and the driver's; every edit outside the file map.
ADDED 17:50 (the first builder's whole driver ended: 1792 of 1794): besides the known w5-maker2, `W10 the editor
has no picture upload control and no Your artwork shelf` FAILS: that older check (scripts/live/flows/w10*.mjs)
said the control is absent because uploads were not built; this bundle builds them. Item 5: change THAT check to
what is true now (the control is there and works, proved by wa7) and nothing else in that flow; name the line.
The stack is down and the worktree's tsconfig.json was restored by the stack script: check `git status` first.
