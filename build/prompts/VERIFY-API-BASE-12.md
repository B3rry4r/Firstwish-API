VERIFIER API-BASE-12 | TIER T2 money and identity, full | Budget 100 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: run ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs, and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab12/NOTES.md as you go (if it exists an earlier verifier was lost:
read it and carry on).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-12.md (its cases are the contract), rulings HR3, HU5, HW2, IF2a,
IF4a in build/rulings-phase3.md, and the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/api-base-12-claims.txt.
Under test: /home/user/Firstwish-API, local branch `api-base-12` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab12 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab12. Run every command
with your own worktree as the working directory. Probes as specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab12/ (not in the repo).
Remove your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). In this order:
 - Whose business (identity and money; a wrong business is another company's clients and money): person P owns A
   and is a login of B; Q owns B. With x-business-id of A, of B, absent, of a business P is not in, a non-id, upper
   case: EVERY route the builder changed (people list/add/edit/remove/import, logins, plan and pack starts and
   reads, invoices, brand and its uploads, PATCH /v1/business, approved dates): P acts on exactly the named
   business with P's role there; a login can do only what a login could before (list each act a login can now do
   that it could not on the base: the builder WIDENED the people routes' roles to ("person","business"): what did
   that open, and to whom: a signed-in person with NO business at all, a removed login, a login of another
   business?); P never reads or changes Q's people through B unless a login may; a plan payment started under B's
   id lands on B (payments, ledger, plan rows) and never on A; 30 parallel starts across A and B. The builder
   answers 404 on these routes for a business the caller is not in while the older business routes answer 403:
   say which routes answer which, and whether the web's error handling could be misled.
 - The creators' backfill (money: the builder says backfilled creatorIds "switch on royalties for those styles from
   now on"): build, on the BASE commit, styles with a handle and no creatorId in every shape (the handle's account
   older than the style; newer than the style; the handle now held by a DIFFERENT account than the one that made
   the style; an erased creator; two accounts that held the handle in turn; a style reviewed by another creator),
   plus wishes already made in those styles and royalty ledger rows; migrate; then: which account each style got,
   that NO style is given to an account that did not make it (a wrong one pays a stranger: HIGH), what the
   migration's notice lists, that past royalty rows are unchanged, and what a new wish in such a style now pays and
   to whom. Run the migration twice.
 - The screening stand-in: STANDIN_SCREENING with PROVIDERS not standin, and with NODE_ENV=production: the process
   refuses to start (show the line); with it on, a held file and a rejected file by name; fileName with a path,
   2,000 characters, control characters: stored safely or refused; without the setting fileName changes nothing.
 - The lows: a delivered Concierge wish is in none of the public reads until the buyer publishes; the staff Prices
   lines all carry `confirmation` (null or the object) and the public book none; the contact-key sweep at 29 and
   31 days by the clock; a webhook reference in upper, mixed and lower case settles ONE payment once (replayed in
   another case: no second settle).
 - Studio reads (the builder changed nothing): one probe that a stranger cannot read a creator's unapproved studio
   file by any of E-266..E-268.
 - The registry: 285 endpoints, no id changed; check-contracts, check-drift, check-routes, gates.sh, typecheck
   EXIT 0; the full suite TWICE (`WEB_LIB=/nonexistent/lib npm test`): any failure: the spec, the test, whether
   this branch touches it.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not run.
