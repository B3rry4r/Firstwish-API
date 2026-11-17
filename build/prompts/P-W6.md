PATCH P-W6 | TIER T2 (this is where a customer pays) | Budget 110 steps. The Maker pay check's findings; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, and a commit on the branch at every closed item.
Stop only processes you started, by their PIDs.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks), rulings ID1-ID3, HR2, IA1 in /home/user/Firstwish-API/build/rulings-phase3.md, and the
verifier's files /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w6-maker3/VERDICT.md and NOTES.md (pictures in shots/).
Work: local branch `w6-maker3` (92c36fd) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w6 (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w6
w6-maker3`; `npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w6-api at the commit in your spawn line (it holds the tenth API
round: ID1's routes); FIRST merge the web work head named in your spawn line into the branch (take the head's
lib/contracts file), then `API_DIR=<your API worktree> npm run contracts:sync` and commit it; ports 5580-5599;
stack prefix pw6; the stack BUILT; the driver as `node scripts/live/drive.mjs` on a FRESH stack. Run every command
with your own worktree as the working directory. You own the W6 files (the Watch, When, Ticket and Seal parts of
components/app/maker/**, lib/seal.ts, lib/maker.ts and lib/draft.ts for those steps, scripts/live/flows/
w6-maker3.mjs), app/app/wishes/return/page.tsx (the ticket case only), and the ONE line a draft's card and page
say about paying (name the files you touched).
 F1 (high, ID1) One person was charged twice for one wish (Moment in one browser, Keepsake in another; and one
    browser: "Leave without paying" on Moment, then Keepsake). The ticket step reads the wish's waiting ticket
    payment from the server: it says which ticket is waiting to be paid and offers "Continue that payment" (the
    same payment) and "Start again" (the server's drop, asks first), and offers no other ticket while one waits; a
    start the server refuses (409) shows the server's words and the same two ways; a payment the server marks
    refund due says so in the server's words. Prove on the server (payments, the ledger, the wish) for: two
    browsers with two tickets at once; leave then another ticket; continue; start again then another ticket; a
    late paid one after start again.
 F2 (medium, ID2) app/app/wishes/return/page.tsx:36: a ticket payment's return lands in the maker (the ticket step
    with the paid ticket and "Seal it", or Sealed); a draft with a paid ticket says "Your ticket is paid. Seal it
    to send." where it is listed and opened (today: "You pay only when it looks right.").
 F3 (medium, ID3) Paid in one browser, sealed in another, "Read the result" in the first: Sealed, not "Who is it
    for?"; the maker opened on a sealed wish at any step address shows Sealed.
The flow checks F1-F3; alone: 0 FAIL; then the whole driver: 0 FAIL but the known W7 resting check (if "W13
moderation: the held photo" fails, run w13 alone once more and report: it is not yours). Checks (quiet logs, EXIT
lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check, build; measure the ticket
step's new states at 360, 390, 1440. Commit; do not push; remove YOUR worktrees, stack and databases; leave no
background jobs. Hand back ONCE in 10 lines: head; F1-F3 with file:line and the measured proof; the driver's totals;
`git diff --stat` against 92c36fd; stale baseline ids if any.
