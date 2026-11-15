VERIFIER B07 | TIER T2 full, money | Budget 100 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B07.md (the cases are the contract),
rulings GG1-GG6 in build/rulings-phase3.md, and /home/user/Firstwish-web/lib/pro-data.ts, lib/catalog.ts, lib/account.ts, lib/studio.ts
(the app is the truth for what each line gives: R5).
Under test: local branch `b07-purchases` (head 3c2339c) of /home/user/Firstwish-API; base local branch int-3 (c4fef88). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b07 (detached at the branch; `npm ci`); ports 4540-4549; TEST_DB_PREFIX=vb07 for every run; remove both when done; kill by PID.
There are no routes: drive everything through the REAL settle path (a payment started, then a signed stand-in webhook) with
your OWN script on createTestApp and the clock port. Known and NOT findings (GG1-GG6): purchase_grant is raw SQL; the ticket
handler mirrors fulfilTicket; payments.start does not call assertStartable yet; business.pack against Vault GB; nothing calls
the draw functions yet; logins, invoices and the end of Signed are owed elsewhere; a paid upgrade is to be refused at start.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b07/CLAIMS.md: PASS or FAIL with what you saw.
The money attacks:
 - Sold is built: for EVERY line of the seeded price book, pay it and list exactly what changed in the database; compare with
   what the web app says that line gives (a table: sku, app says, server granted). A line that grants nothing, less or more is HIGH.
 - Granted once: for five different lines, 10 webhooks + 10 verifies at once: one grant row, counters moved once.
 - Granted to the right owner: a ticket for another account's wish, a keep for another's wish, a plan for another's business, a
   Pass for an erased account: nothing granted, flagged for refund; and nothing granted to the payer either.
 - Counters under load: Pass with 1 wish left, 30 draws at once: one yes; business allowance 3 + pack 5, 20 draws at once:
   exactly 8 yes, allowance used before the pack; credits never below zero.
 - Time: a keep on the last second of a wish's term and one second after; two keeps of different lengths at once (sum of
   both); a pack one second before and after its 90 days; a second Pass while one runs; a plan renewed early and late against
   roll() in lib/pro-data.ts (work 3 cases by hand).
 - Revoke: for each line pay, revoke, and check the database is back to before (list what is not); revoke twice; revoke after
   the grant was used (a Pass with wishes drawn, a pack with wishes used, a ticket on a sealed wish): what happens and is it sane?
 - Failure: a handler that throws midway leaves no grant, no ledger row, payment pending, and the retry grants once.
 - No float, no Date.now() in the module (grep).
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/purchases src/modules/payments src/modules/wishes` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b07/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
