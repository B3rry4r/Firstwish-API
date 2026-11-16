PATCH P-WEB-API-4 | TIER T2 | Budget 100 steps. Make the whole live driver pass, and close the verifier's findings; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules), /home/user/Firstwish-API/build/prompts/WEB-API-4.md and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-4/VERDICT.md (its logs are beside it).
Work: branch `web-api-4` (c7a70f9) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-wa4 (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-wa4
web-api-4`; `npm ci`). FIRST merge the web branch head (commit in your spawn line: it holds the receiver's screens and
their flow scripts/live/flows/w7.mjs, which still calls the removed plantCode) into web-api-4 with a merge commit (no
rebase), keeping both sides' work, and make every flow on the merged branch use codeFor() (the file the API writes).
API for your stack: a detached worktree at the commit in your spawn line, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-wa4-api (the API head: a seal
refuses a style above the wish's ticket; the stand-in storage receives a put; STANDIN_CLOCK_OFFSET); then
`API_DIR=<your API worktree> npm run contracts:sync` and commit the copied file if it differs; ports 5480-5499; stack
prefix pwa4. Run every command with your own worktree as the working directory.
 F1 (high) `npm run live:drive` on ONE fresh stack runs every flow on the merged branch (auth, W3, PW3, W4, W7, W11,
    W12, W13, WA4) to the end with 0 FAIL, twice in a row. Known causes: (a) the W3 and PW3 flows seal with styles[0],
    which is a Premium style: the API now answers 422 ("Aso-ebi is a Premium style. A Keepsake ticket takes Standard
    styles and below"): the flows pick a style the ticket allows (read the wish's allowedStyles); and say what the
    APP shows a person in that case (the wish detail and the maker must show the server's words: if a screen
    swallows the 422, that is an app fix in this patch, in the person's app files you own); (b) the W4 flow times out
    at "Team Jide" waiting for "anyone else" while the screen still asks "What do you call them?": find whether the
    maker's teams path changed (an app fault: say which commit) or the flow is wrong, and fix the right one (the
    maker's files are another bundle's: if the fault is in the app, write the smallest fix and name it clearly in the
    hand-back so the maker's builder can take it).
 F2 (medium) The uncaught "Event" page error on every /app/new screen at 360: the earlier checker saw it only when
    the web-font host could not be reached (3 of 3 walks with fonts blocked, 0 of 7 with fonts answered): find the
    loader that lets a failed font or stylesheet load reach window as an unhandled error or rejection (the app's
    layout or the maker's layout), and make a failed font load silent (the page falls back to its system font);
    prove with the font host blocked: 0 page errors on /app/new, /app and the website's home.
 F3 (medium) components/app/life/WishCard.tsx: after one failed picture load the card re-reads the wish and tries
    the picture again (a fresh url or the same one once more), and draws it when it loads; it falls back to the mark
    only after the second failure. Test with a url that fails once.
 F4 (low) "Ban the account" sends an Idempotency-Key like the other staff writes; the Audit "Who" filter lists
    current staff first and removed staff under a "Removed" label (or not at all if the Team read is asked without
    them: say which); the flow's console filter no longer hides "Failed to load resource" for requests the test did
    not expect (list expected failures by URL instead); tsconfig.json carries no .next-wa4 paths.
Checks (quiet logs, EXIT lines): typecheck (0 errors with the new contract file), lint, check:css, `npm run gates`
(0 fail, no new finding), `npm run test:client`, `npm run build`, the full driver twice. Commit on web-api-4; do not
push; do not commit wired.json or the baseline; remove your worktrees, stack and databases; leave no background jobs.
Hand back ONCE in 10 lines: head; F1-F4 closed or not with file:line; the two driver totals; any app fault found in
another bundle's files (file:line, the fix you made); NOT RUN.
