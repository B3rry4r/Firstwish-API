PATCH P-DRIVE | TIER T1 | Budget 70 steps. The whole live test must end with 0 FAIL on the merged head; three checks do not. Find each cause and fix it in the right place; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed item; stop only PIDs you
started. If the branch, worktree or commits of this patch already exist, an earlier agent was lost: read git log
and carry on.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks). Work: a new local branch `p-drive` of /home/user/Firstwish-web from
claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-drive (`npm ci`); API worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-drive-api detached at the commit in your spawn line; ports 5540-5559; stack prefix pdrive; the stack
BUILT (`npm run live:up -- --built`, never next dev); the driver as `node scripts/live/drive.mjs` on a FRESH stack.
Run every command with your own worktree as the working directory. You own scripts/live/flows/{w6-maker3,w2-site2,
w13}.mjs; an app file ONLY if item 1's cause is in the app (then at most 30 lines, and say so first in your
hand-back).
 1. "the W6 flow ran to the end" FAILS on the merged head, alone on a fresh stack too (54 PASS, 1 FAIL):
    scripts/live/flows/w6-maker3.mjs:124 (`ready`: waiting 45 s for an enabled "Seal it") called at :283, right
    after the step "a draft holding a time already past". The same flow passed alone twice (138 PASS) on its own
    branch a few hours earlier against the API one half-round older. Find which it is and PROVE it: (a) the newer
    API (compare the requests and answers of that step against API 8271bc9 and against the head's API: what
    differs), (b) the time of day (the step builds "a time already past" from the clock: does it behave
    differently after some hour, or near midnight in the wish's zone), or (c) the merge. If the screen is wrong for
    a real person (a draft with a past time leaves "Seal it" off with no words saying why), that is an app
    finding: fix it so the ticket step says, in the server's words, what to change, and the flow checks that. If
    only the flow is wrong, fix the flow. It must then pass at any hour: run it with the stand-in clock set to
    three different hours (STANDIN_CLOCK_OFFSET) or say why that cannot be done.
 2. "W2 showing: a wish the server lists is a card at its own link" fails in the whole driver (its check wants
    exactly one tile; other flows now list wishes before it): the check finds ITS wish's tile by its link and
    checks that one; it must not depend on what other flows left.
 3. "W13 moderation: the held photo in the queue" (HP12) has failed under load in four whole runs and passes
    alone: make the flow wait on the queue's state (the photo's row is there), not a fixed time.
Then the whole driver on a FRESH stack TWICE: 0 FAIL both times (1502 checks or more; wired 89 of 89). Checks
(quiet logs, EXIT lines): typecheck, lint on changed files, gates, test:client. Commit; do not push; do not edit
.pipeline-ui/wired.json or scripts/gates/baseline.json; remove YOUR worktrees, stack and databases; leave no
background jobs. Hand back ONCE in 10 lines: head; for each item the CAUSE with the proof, and the fix with
file:line; both driver totals; `git diff --stat` against the base.
