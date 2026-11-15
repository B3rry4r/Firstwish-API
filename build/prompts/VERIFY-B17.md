VERIFIER B17 | TIER T2 full, money and identity | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B17.md (the cases are the contract),
rulings OO1-OO6 in build/rulings-phase3.md, and /home/user/Firstwish-web/lib/pro-data.ts and lib/pro-api.ts (the app is the truth, R5).
Under test: local branch `b17-business` (head 87d15c3) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b17 (detached at the branch; `npm ci`); ports 4740-4749; TEST_DB_PREFIX=vb17 for every run; a clock in the year 2180 for
your own cases; remove both when done; kill by PID.
Known and NOT findings (OO1-OO6): E-33 is not built; a login's account needs the business side set to pass the guard (set it
directly in your script, as the builder's spec does); no invite email yet; invoice link and counter are SQL tables; the plan
handlers do not call invoices.issue yet (wrap them as the builder's spec does); a staff read writes the month roll.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b17/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - Another business: with business B's owner and with B's login, every route with A's ids (client wishes, logins, invoices, the
   invoice file, usage, a client wish's detail): nothing read, nothing changed. A login of A reads A's client wishes but no
   billing. A removed login: 403 at once, also on a request already in flight (say). A login invited to A and B: which does it see?
 - Wishes for money: 30 client wishes at once with 3 month + 2 pack left: exactly 5 made, 3 from the month first; a failed
   creation (a bad body after the draw) gives the wish back (the draw rolls back with it); a lapsed plan with pack wishes; the
   month rolling between two requests (clock) while 10 are in flight.
 - Logins: 10 invites at once with 1 seat; the same email in another case; inviting the owner's own email; an invite to an email
   that already owns another business; plan downgraded from Studio to Starter with 3 logins live: what happens (say: it must
   not silently keep 3 seats without saying so, and must not lock the owner out).
 - Invoices: 20 plan payments at once across 3 businesses: numbers consecutive, no gap, no duplicate, in one sequence; VAT for
   five totals worked by hand first; a refund voids and the number is never reused; the HTML file: a business name with a
   script tag is escaped (stored XSS in an invoice is HIGH); another business's invoice id is 404; the file never shows
   another business's data.
 - Erase: erase the owner's account: what happens to the business, its logins, its client wishes and invoices (list; client
   wishes must play to the end of their terms per T-58, invoices are kept without the owner's personal data).
 - Staff: every staff role on each staff route against the registry; a read does not change money or usage beyond the month
   roll; no full email in the staff answer.
 - Errors: the envelope; no 500 for a non-uuid id, a bad cursor, a NUL byte.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/pro-business src/modules/purchases` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b17/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
