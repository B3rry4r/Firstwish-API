VERIFIER P-W8c re-check | TIER T2 short (a payment screen) | Budget 45 steps. You did not build this. Only the patch and what it could break. You fix nothing.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md (rules), the patch brief
/home/user/Firstwish-API/build/prompts/P-W8C.md and rulings HR1, HY1 in /home/user/Firstwish-API/build/rulings-phase3.md. Under test: /home/user/Firstwish-web local branch
`merge-chain` (head in your spawn line; before the patch: 537ab2d). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w8c (web) and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w8c-api (API at the commit in your spawn line); stack prefix vw8c; ports 5460-5479; the stack BUILT
(`npm run live:up -- --built`); verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w8c/. Run every command with your own worktree as the
working directory. Two other browser stacks share the machine: rerun a failed step once alone before you call it.
 1. One plan, one payment: two tabs both tap Pay for the same plan; leave without paying then Pay again; back
    button from the provider then Pay; a double tap; a reload mid-sheet: after each, the server has ONE pending plan
    payment for the business and the screen says so ("waiting to be paid", Continue). Continue pays THAT payment
    (same reference); the plan is live once; one invoice.
 2. Another plan while one is pending: held with the server's words; no second payment row; a direct call gets 409.
 3. After the pending one fails, is abandoned by the sweep (move the stand-in clock), or settles: the screen offers
    a new payment and it works.
 4. A login (not the owner) starts a plan payment and leaves: what the OWNER then sees and can do (Continue the
    login's payment? pay for a different plan?) and for how long they are held: describe exactly; a person held
    with no way forward and no words saying until when is MEDIUM (ruling HY1 names the server route still owed).
 5. The words: each plan's effect text on the card and in the sheet equals the server's `offers[].words` (same
    plan live: adds a month to which day; another plan: replaces from now); nothing about money typed in the web.
 6. 360x740, 390x844, 1440x900, light and dark, the four states (no payment, pending, refused, after a return): no
    sideways scroll, every control in its cell, no dead control; one picture pair per state at 360.
 7. The flow scripts/live/flows/w8.mjs alone: 0 FAIL; read its diff against 537ab2d: is any changed assertion
    weaker than the old one? typecheck, gates, test:client EXIT 0.
Hand back ONCE in at most 12 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove your worktrees, stack and databases; leave no background jobs.
