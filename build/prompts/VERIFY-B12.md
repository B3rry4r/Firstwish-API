VERIFIER B12 | TIER T1 lean (plus the parallel and owner cases) | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B12.md (the cases are the contract).
Under test: local branch `b12-dates-saved` (head 1734dc8) of /home/user/Firstwish-API. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b12 (detached at the
branch; `npm ci`); ports 4320-4329; database prefix vb12; remove both when done; kill by PID. Endpoints: E-45..E-48, E-117..E-121,
E-17, E-155, E-156. Run the stack (`scripts/stack.sh up vb12 4320`) and test over real HTTP with your own scripts.
Known and NOT findings (rulings BB1-BB5 in build/rulings-phase3.md): approved dates are read only; Person is the business's people;
today is Africa/Lagos; the account-lock helper (AA1) is not on this branch yet (it comes with INT-2).
CLAIMS: each numbered line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b12/CLAIMS.md: PASS or FAIL with what you saw.
Attacks: with account B's token, every route with A's date ids, person ids, business: nothing read, nothing changed (owner check
in the query); dates at the edges: 1900-01-01, 1899-12-31, 2026-02-30, 0000-00-00, a date in the future, a time with a zone sent
as a date; the day count around midnight Lagos (clock port at 22:59 and 23:01 UTC) and on the day itself (0 days, not 365);
31 December and 1 January; 20 identical adds at once: one row; the 1,000 limit under 20 parallel adds at 995 (exactly 1,000);
delete then undo at once; a person removed while their date is being read; the import of 500 people with one bad row (all or
nothing? say) and a formula-looking name ("=cmd|..."): stored as text; paging returns every row once; a NUL byte in a name
(known kernel gap AA3: report the status only); save a wish 30 times at once from 3 accounts: counts equal rows.
Errors: the envelope; no 500 except the known NUL case. Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh,
check-contracts, `npm run test:affected -- src/modules` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b12/VERDICT.md (40 lines or fewer). Hand back in 15 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
