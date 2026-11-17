PATCH P-W9c (a re-cut after two rounds) | TIER T2 (pack wishes are paid) | Budget 90 steps. The reveal form sends by the server's one call; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, and a commit on the branch at every closed item.
Stop only processes you started, by their PIDs.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks), rulings IA1, IC1, IC3, IC8 in /home/user/Firstwish-API/build/rulings-phase3.md, the second
check's notes /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w9-business2/round2/NOTES.md, and the contract of E-272 (POST /v1/business/reveals:
one call makes the client wish and the reveal or neither, idempotent by its key; 409 already_sent with when and the
link unless `again`).
Work: local branch `w9-business2` of /home/user/Firstwish-web (head in your spawn line) in a NEW worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w9c (`git worktree add
--detach` will not do: you commit on the branch; if the branch is checked out in another folder, make branch
`w9-business2c` from it and say so); `npm ci`; API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w9c-api at the commit in your spawn line
(it has E-272); FIRST `API_DIR=<your API worktree> npm run contracts:sync` and commit the contract file; ports
5600-5619; stack prefix pw9c; the stack BUILT. Run every command with your own worktree as the working directory.
You own app/app/pro/reveal/**, lib/vault-api.ts, components/app/pro/RevealPlay.tsx, scripts/live/flows/w9.mjs.
 F1 (high) lib/vault-api.ts sendReveal and app/app/pro/reveal/new/page.tsx: the send is ONE call to E-272 with one
    Idempotency-Key made for the form's intent (the same while the person retries the same send; a new one when
    they change who it goes to); findLeftWish, the day-and-occasion match and the Web Locks guard are deleted.
    Prove on the server (the pack, client wishes, reveals, outbox after each): a refused send then fixed (now and
    after 20 hours by the stand-in clock); a lost answer then a retry; a reload mid-send; two tabs; TWO DIFFERENT
    BROWSERS at once (three rounds); a client wish the business made on purpose for the same client and day is
    never touched. Each: one wish, one reveal, or neither.
 F2 (medium) Send again: the form says, in the server's or plain words, that sending again takes no wish and sends
    the email again; it does send the email again (the outbox goes up by one); a different client is a new reveal
    and says it takes one wish.
 F3 (low) /r/<code> carries the same chrome as /w/<slug> and no extra brand mark; the page asks for its photos
    again before the unlock runs out (the server's unlock lasts 15 minutes): a tab open 20 minutes by the stand-in
    clock still shows the photos or asks for the passcode again in the receiver's own words, never a broken page.
The flow w9.mjs checks every F1 path (two browsers too) and F2; alone: 0 FAIL; then the whole driver on a FRESH
stack: 0 FAIL but the two known W7 ones. Checks (quiet logs, EXIT lines): typecheck, lint on changed files,
check:css, gates, test:client, contracts:check, build; measure the reveal form and the Went screen at 360, 390, 1440.
Commit; do not push; remove YOUR worktrees, stack and databases; leave no background jobs. Hand back ONCE in 10
lines: head and branch; F1-F3 with file:line and the measured proof; the driver's totals; `git diff --stat`.
