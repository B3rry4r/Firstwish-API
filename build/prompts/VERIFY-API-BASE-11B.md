VERIFIER API-BASE-11B | TIER T2 (case 1 erases people's wishes and files; the rest are public reads) | Budget 100 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: run ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs, and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab11b/NOTES.md as you go (if it exists an earlier verifier was
lost: read it and carry on).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-11B.md (its cases are the contract), rulings IF4, IF5, IF6, IF2a,
HU2, HU4, IC4, HX2-HX4 (erase) in build/rulings-phase3.md, and the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/api-base-11b-claims.txt.
Under test: /home/user/Firstwish-API, local branch `api-base-11b` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab11b (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab11b. Run every command
with your own worktree as the working directory. Probes as specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab11b/ (not in the repo).
Remove your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). In this order:
 - The erase (IF4; a wrong erase cannot be given back): a removed wish at one minute before and one minute after
   its day by the clock, with the REAL job; restore at the same instant the job runs (30 pairs: restored and
   whole, or erased and gone, never half); a wish removed, restored, removed again (the clock starts again); a
   removed wish that holds a paid ticket, a keep, a waiting payment, a reveal sent to a client, a Concierge order's
   wish, friends' voices, a place in Now Showing: what each leaves, the ledger untouched, a late webhook for its
   payment after the erase (no crash, refund due or said). Wishes removed BEFORE the migration: their day; a wish
   a STAFF member took down, a wish under a report, an ended wish, a draft: never erased by this job. The stored
   objects before and after (list the stand-in store). Nothing of another person's goes. The builder says an
   erase now also removes friends' gather voices: also on the account-erase path, and only that wish's.
 - The friends' link on again (IF5): owner only (a login, a stranger, staff: refused); the same slug; voices kept;
   the 12 cap and the hourly limits as before; on for an opened, sealed, ended, removed wish (what /gather/off's
   rules say); on and off 30 times at once: one state, no duplicate link.
 - The public reads (IF6, IC4): GET /v1/showing with ?style, E-284 wishes in a style, E-283 and E-285 by a
   creator's handle: NEVER a wish that is hidden (a Concierge wish being made), resting, ended, removed, erased,
   passcoded, not listed, taken down, or of a suspended or erased owner; never a field that is private (email,
   ids of accounts, the receiver's name where the owner did not publish it); a creator who is suspended, signed
   off or erased: 404; paging by the conventions; cached as the other public reads; a style slug or handle with
   odd characters (IF2a: 404, never 500); the style and title are the ones at publish time after the owner edits.
 - PublicWishView.house and keepOffer: on a house wish, a paid wish, a resting one; nothing else in the view moved
   (diff the view's keys against the base for five kinds of wish).
 - The registry: 285 endpoints, only E-283..E-286 new, no id changed; the builder HAND-PATCHED the contract file
   and schema.prisma: regenerate both the repo's own way and say whether the committed files equal what the
   generators give (a difference is a finding); check-contracts, check-drift, check-routes, gates.sh, typecheck
   EXIT 0; the migration on a database with wishes in every state (made on the base first), twice.
 - The suite: the full suite TWICE (`WEB_LIB=/nonexistent/lib npm test`): any failure: the spec, the test, whether
   this branch touches it.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not run.
