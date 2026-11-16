PATCH P-W8c | TIER T2 (a payment screen) | Budget 60 steps. The Business branch against the newest server: the Plan screen and its flow; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks) and ruling HR1 in /home/user/Firstwish-API/build/rulings-phase3.md (the server now says
what a plan payment would do, and REFUSES a second plan start while one is pending: 409 with words and the pending
payment's reference: read the contract for GET /business/plan and the plan start).
Work: local branch `merge-chain` of /home/user/Firstwish-web (537ab2d = the work head with w8-business1 merged in) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w8c (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w8c merge-chain`; `npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w8c-api at
the commit in your spawn line; ports 5460-5479; stack prefix pw8c; start the stack BUILT (`npm run live:up --
--built`). Run every command with your own worktree as the working directory. You own app/app/pro/plan/** and
scripts/live/flows/w8.mjs only (PayStart.tsx is import-only: a needed change goes under REQUESTS).
The driver on this tree fails two W8 checks (the merge agent's run): "a payment left open is still pending on the
server, and the Plan screen says so" (the flow expects old words; the screen says "Paying now starts a new one") and
"plan words" (waitForSelector('.fl-standin') timed out: find the cause first; the server's 409 is the likely one).
 F1 The Plan screen with a payment left open: it says so in the server's words and offers to CONTINUE that payment
    (the reference the server gives), never to start a second one; a start the server refuses (409) shows the
    server's words and leads to the pending payment; after the pending one settles, fails or is abandoned by the
    server's sweep, the screen offers a new payment again.
 F2 Each plan on offer says what paying now would do, in the server's words (HR1), where the screen today says its
    own.
 F3 The flow checks what the screen now does (words from the server, the continue path, two tabs: one payment), with
    no check loosened: every assertion you change is named in the hand-back with its old and new text.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, build; measure the
Plan screen at 360, 390, 1440 in its states (no payment, pending, refused, after a return); then the whole `npm run
live:drive -- --allow-not-wired`: 0 FAIL but the one named W7 resting check. Commit on merge-chain; do not push;
remove your worktrees, stack and databases; leave no background jobs. Hand back ONCE in 10 lines: head; the cause of
the second failure; F1-F3 with file:line and the measured proof; the driver's totals; `git diff --stat` against 537ab2d.
