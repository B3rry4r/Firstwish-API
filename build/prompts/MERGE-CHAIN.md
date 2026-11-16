MERGE AGENT (web) | TIER T1, one run | Budget 160 steps. Four checked branches join the web work branch, one on top of the other.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID. You write no feature code:
only what a merge needs (conflicts, a flow's sign-in helper, an import path), and you say every such line.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks) and the MERGE CHAIN rows of /home/user/Firstwish-API/build/sweeps/web.md.
Work: /home/user/Firstwish-web; a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/mc on a new local branch `merge-chain` made from the web
head in your spawn line (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/mc-api at the API commit in your spawn line; ports
5400-5419; stack prefix mc. Run every command with your own worktree as the working directory. Never commit on
claude/sleepy-mayer-f0hkb8; never push; never edit scripts/gates/baseline.json, .pipeline-ui/wired.json or a gate.
In this order, ONE merge commit each (`git merge --no-ff`): w8-business1, then w5-maker2, then w1-site1, then
w10-studio. For each:
 a. Conflicts: lib/contracts/** and lib/api.ts, lib/session.ts, lib/staff-session.ts, scripts/live/standin.mjs and
    stack.mjs take the work head's side; scripts/live/drive.mjs keeps BOTH sides' flows (`node --check` after);
    baseline.json and wired.json take the work head's side; a real conflict inside a screen's file: read both
    sides, keep what each side's check passed, and report the file and the lines.
 b. The branch's live flows read sign-in codes with codeFor() from scripts/live/standin.mjs (plantCode is gone);
    drive.mjs's call of the w5b flow skips the picture when pics is null.
 b2. w10-studio: components/app/studio/{Editor,Home,Start}.tsx take w10-studio's side, then the stylesheet link in
    each loses `precedence` again (the work head removed it: a failed font load must not throw); its flow's own
    signInCode() becomes codeFor().
 c. After w1-site1 is in: delete lib/site-plans.ts if nothing imports it (say which file still does, if one does).
 d. Checks (quiet logs, EXIT lines): typecheck, lint (0 errors), check:css, gates (report every FAIL line; do not
    fix by baseline), test:client, `API_DIR=<your API worktree> npm run contracts:check`, build, then the whole
    `npm run live:drive -- --allow-not-wired` on a fresh stack started BUILT (`npm run live:up -- --built`; never
    next dev: its first-hit compiles time the flows out): every flow, 0 FAIL but ONE the work head already has
    against this API: "W7 resting, ended and removed: the server's 410 words" (status=200/410: since the sixth API
    round a resting wish's link answers 200 "resting"; another bundle redraws that state). Leave that check as it
    is; any other FAIL counts. A red check caused by the merge
    is yours to fix inside the merge's scope; one caused by the branch's own code: stop at that branch, report it,
    and do not go on to the next.
Hand back ONCE in at most 14 lines: the four merge commit ids in order (or where you stopped); per branch: the
conflicts and how each was settled, the lines you wrote, the EXIT lines and the driver's totals; `python3
scripts/gates/run.py --json` finding ids present at the last commit that the work head's baseline lacks (new), if
any. Remove your worktrees, stack and databases (keep the branch); leave no background jobs.
