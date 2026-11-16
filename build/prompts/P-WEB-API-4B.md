PATCH P-WEB-API-4b | TIER T1 small | Budget 40 steps. Three named lines from the second check; a diff of 30 lines or fewer that the lead reads; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks). Work: commit on local branch `web-api-4` (0bd3241) of /home/user/Firstwish-web in a
new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-wa4b (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-wa4b web-api-4`; `npm ci`), API worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-wa4b-api at 1056ded; ports 5480-5499; stack prefix pwa4b. Run every command with your own worktree as
the working directory.
 F1 (medium) components/app/life/WishCard.tsx Thumb: the failure count is kept per picture url, and every re-read of
    the wish gives a NEW signed url, so a picture that can never load asks for the wish again without end. Count the
    failures per wish for as long as the card is mounted: after the second failure the mark is drawn and nothing
    more is asked (a later url change by its own expiry timer may try once more). Prove it in a browser on the
    stack: abort every picture request for 20 s on Home with one wish that has a picture: at most 2 extra reads of
    that wish and 2 picture requests, then silence; with one failure then success, the picture is drawn.
 F2 (high, the driver's honesty) scripts/live/flows/web-api-4.mjs:68-72: a failed request is expected only when its
    host is not this machine (the blocked outside hosts) or its URL is on the named list; a failed request to the
    API on 127.0.0.1 or localhost, on any port, is an error. The staff-accounts entry expects only a 409 (check the
    response status where the console message carries it, else match the request by method PATCH and the one id the
    flow changed).
 F3 (medium) scripts/live/flows/w13.mjs:~310: the held-photo check failed once in a second run under load (the
    check reads the page right after it opens). Wait for the queue's held photo (up to 15 s) before the check; do
    not loosen what is checked. Then run w13's flow alone twice on one stack: if it fails the second time with the
    wait in place, it is second-run state: find which row the first run left and make the flow remove its own data.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates, test:client; then the whole `npm run
live:drive -- --allow-not-wired` twice back to back on one fresh stack while no other job of yours runs. Commit on
web-api-4; do not push; remove your worktrees, stack and databases; leave no background jobs. Hand back ONCE in 8
lines: head; F1-F3 with file:line and the measured proof; both driver totals; `git diff --stat` against 0bd3241.
