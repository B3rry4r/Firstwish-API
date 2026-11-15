VERIFIER P-B12 | TIER T1 lean, re-check by ruling id | Budget 35 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B12.md, rulings AA1, AA3, BB6, BB7 in build/rulings-phase3.md.
Under test: local branch `p-b12` (head d360eb1) of /home/user/Firstwish-API; base int-2 at 16d540b. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b12
(detached at the branch; `npm ci`); ports 4430-4439; database prefix vpb12; remove both when done; kill by PID.
With your OWN script on createTestApp (and the stack for the plain HTTP cases), say CLOSED or OPEN for each:
 AA1: race the erase service against adding a date, adding a person and saving a wish, 10 times each: nothing lands on the erased account.
 AA3: a NUL byte in a name, occasion or note: 422 on every route of dates, people, saved wishes.
 BB6: forgetForWishes(tx, wishIds) removes every saved row of those wishes inside the caller's transaction (rolled back: rows stay).
 BB7: 120 dates paged 50 at a time while the clock port crosses midnight Lagos between pages: every row once, none twice; a POST
      naming another account's row id answers 404; an import of 5 rows with 1 bad answers {added: 4, skipped: [{row, reason}]}.
Also: B12's round-1 cases still hold (20 identical adds at once make one row; at 995 dates 20 adds give exactly 1,000; another
account's ids give 404 or an empty list); the diff touches only dates, people, saved-wishes, approved-dates.
Checks (quiet logs, EXIT lines): typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/dates src/modules/people src/modules/saved-wishes` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b12/VERDICT-P.md (25 lines or fewer). Hand back in 10 lines or fewer: verdict merge or fix; each OPEN id with file:line; what you did not run.
