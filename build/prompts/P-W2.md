PATCH P-W2 | TIER T1 | Budget 35 steps. One finding from the check of W2; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed item; stop only PIDs you
started. If the worktree or commits of this patch already exist, an earlier agent was lost: read git log, carry on.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks) and the check's notes
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w2-site2/VERDICT.md.
Work: local branch `w2-site2` of /home/user/Firstwish-web (head 20f8bd0) in a NEW worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w2 (you
commit on the branch); `npm ci`; API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w2-api detached at the commit in your spawn line; ports
5540-5559; stack prefix pw2; the stack BUILT (`npm run live:up -- --built`, never next dev). Do NOT sync the
contract file (the lead did on the head). Run every command with your own worktree as the working directory.
You own app/styles/[slug]/** and scripts/live/flows/w2-site2.mjs only.
 F1 (medium) app/styles/[slug]/page.tsx:42: a style that is off, and a slug the server does not know, answer HTTP
    200 with "That style is not on right now." The server answers 404 for both. Make the page answer HTTP 404 with
    the SAME designed words and the site's chrome (Next's notFound() with a not-found file for this route is one
    way), for a first visit and for a kept copy. Prove with curl -i and in the browser: off style 404; unknown
    slug 404; the style switched on again is back with 200 within the page's refresh time (a kept 404 must not
    outlive it: measure the seconds); a style switched off while its page is kept turns 404 within the refresh
    time; the API stopped: a kept good page still answers 200 (the last good copy), never a 404 for a style
    that is on. JavaScript off: the words are in the HTML.
The flow w2-site2.mjs checks the statuses (off, unknown, back on); alone: 0 FAIL. Do NOT run the whole driver.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, build.
Commit; do not push; remove YOUR worktrees, stack and databases; leave no background jobs. Hand back ONCE in 10
lines: head; F1 with file:line and the measured statuses and seconds; the flow's totals; `git diff --stat 20f8bd0`.
