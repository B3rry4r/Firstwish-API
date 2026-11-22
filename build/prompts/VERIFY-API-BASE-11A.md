VERIFIER API-BASE-11A | TIER T2 money and identity, full | Budget 110 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: run ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs, and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab11a/NOTES.md as you go (if it exists an earlier verifier was
lost: read it and carry on).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-11A.md (its cases and the ADDED case 6 are the contract), rulings
IF1, IF2a (it CORRECTS IF2), IF3, IE2, ID1, HU1, HU3, R14 in build/rulings-phase3.md, and the claims in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/api-base-11a-claims.txt.
Under test: /home/user/Firstwish-API, local branch `api-base-11a` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab11a (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab11a. Run every command
with your own worktree as the working directory. Probes as specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab11a/ (not in the repo).
Remove your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). In this order:
 - The return path (IF1, identity and money: an open redirect sends a payer to a stranger's site with a payment
   reference): every way to make the provider's return leave our site or land on a page of another subject:
   "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/.//evil", "https:evil", "/w/x@evil.example", a
   tab or newline inside, unicode slashes and dots, double-encoded, 10,000 characters, a path for another wish, a
   path with its own ?reference= or a fragment, "/../", upper-case scheme. Read what the stand-in provider is
   actually given and where the return lands. One escape is HIGH. Then: with no path every start behaves exactly as
   on the base (compare the provider call byte for byte for a ticket, a keep at the link, a plan).
 - Ids (IF2a): a non-id in the PATH at a sample of 25 routes across every module (public, signed-in, business,
   staff, the link, payments by reference): 404 as on the base, never 422, never 500; a non-id in a BODY or QUERY
   id field: 422 in words, never 500 (find the fields from the contract; sample 15); upper and mixed case of a real
   id: the same thing on reads, writes, drops and webhooks; an id of the right shape that belongs to someone else:
   unchanged (404 or 403 as on the base). The older tests: `git diff` of spec files against the base: every changed
   expectation line is one the claims file names; anything else moved is a finding.
 - Extras (IF3, money): the same extra twice at once (30 pairs), different extras, an extra beside a ticket payment,
   drop by the owner, by another account, of a paid one; a second PAID same extra: refund due with words; ledger.
 - The contact key: same key and body, same key other body, 30 at once, no key; a key from another address; the
   key table does not grow without bound (is there a sweep? if not, LOW).
 - Refund of a Concierge order: rows and stored objects gone when the refund commits; a refund that fails half way
   leaves neither half done.
 - Prices (case 6): GET the staff Prices read as owner, finance, ops, a maker: `confirmation` on every line; finance
   then owner on both provisional settings; the names carry no status word; the price book the PUBLIC reads serve
   shows no `confirmation` and no staff-only field; the web's Prices screen on the BASE web still works with the
   empty `lead` on other limit lines (read /home/user/Firstwish-web/components/admin/c/Prices.tsx: say what it draws).
 - The registry: 281 endpoints, no id changed; check-contracts, check-drift, check-routes, gates.sh, typecheck
   EXIT 0; the migration on a database with support threads and payments in every state; the full suite TWICE
   (`WEB_LIB=/nonexistent/lib npm test`): any failure: the spec, the test, and whether this branch touches it.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not run.
