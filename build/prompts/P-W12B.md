PATCH P-W12B | TIER T1 (a staff screen; no money moves) | Budget 45 steps. The staff Prices screen draws the provisional mark from the server; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed item; stop only PIDs you
started. If the branch, worktree or commits of this patch already exist, an earlier agent was lost: read git log
and carry on.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks), rulings R14, IE3 and the IF section in
/home/user/Firstwish-API/build/rulings-phase3.md, and the contract of the staff Prices read (the web's lib/contracts file after your
sync: every line may carry `confirmation`: null, or {provisional, confirmedBy: "owner" | null, confirmedAt}).
Work: a new local branch `p-w12b` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w12b (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w12b-api detached at the commit in your spawn
line (it holds the eleventh round's first half); FIRST `API_DIR=<your API worktree> npm run contracts:sync` and
commit the contract file if it changed; ports 5540-5559; stack prefix pw12b; the stack BUILT (`npm run live:up --
--built`, never next dev). Run every command with your own worktree as the working directory. You own
components/admin/c/Prices.tsx and scripts/live/flows/w12.mjs only.
 F1 components/admin/c/Prices.tsx:91 and :146: the PROVISIONAL mark is drawn only for the payout key, from `lead`.
    Draw it for EVERY line whose `confirmation.provisional` is true (the payout threshold and "Days the files of an
    order that is never paid are kept" today), from that field only; the sheet's sentence about the mark staying
    until the owner makes a change is said for any provisional line (in plain words, not naming the payout only);
    a confirmed line shows no mark. No key name decides the mark.
 F2 scripts/live/flows/w12.mjs:366-379: the checks read the mark on the ROW they changed, not the word anywhere on
    the page: finance changes the payout threshold: its row keeps the mark; the owner changes it: its row loses
    the mark and shows the new figure; the same two steps for the files-days line; a line that is not provisional
    never shows it.
The flow w12.mjs alone on a FRESH stack: 0 FAIL (if it cannot run alone, as an earlier agent found (an import
error), fix that in the flow file and say what it was). Then the whole driver ONCE on a fresh stack: 0 FAIL (if a
flow outside your files fails only under load, rerun that flow alone and report both). Checks (quiet logs, EXIT
lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check, build; measure the Prices
screen with both marks at 360, 390 and 1440, light and dark (/admin/wishes-style sideways scroll is a finding).
Commit; do not push; do not edit .pipeline-ui/wired.json or scripts/gates/baseline.json; remove YOUR worktrees,
stack and databases; leave no background jobs. Hand back ONCE in 10 lines: head; F1, F2 with file:line and the
proof; the flow's and the driver's totals; `git diff --stat` against the base.
