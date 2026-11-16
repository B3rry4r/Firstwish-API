VERIFIER API-BASE-4 | TIER T2, full | Budget 120 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-4.md (its eleven items are the contract), rulings HP1-HP13 in
build/rulings-phase3.md, and the claims in your spawn line.
Under test: /home/user/Firstwish-API, local branch `api-base-4` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab4 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab4. Probes as specs under
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab4/ (not in the repo). Remove your worktree and databases when done.
Attack through the real routes (each PASS or FAIL with what you saw). Privacy and money first:
 - Signed picture urls (HP3, HP12, HP13): the owner's wish read gives a url only to the owner; another person, a login
   of another business, a signed-out caller: none. A url after its ten minutes: refused. A url with one character
   changed, another file's id with this url's signature, a path walk (../): refused. A refused or still-screening photo
   NEVER gets a url (owner, feed, moderator apart: the moderator's held-photo url is for moderator, ops, owner only:
   each other staff role by direct call; one audit row per read). The feed's cover (img) is given only for a screened
   cover of a wish that is published and live: a wish taken down, unlisted, ended, removed or erased gives "" at once,
   and a url handed out before does not outlive it by more than its ten minutes (say what happens). The stand-in
   storage route (API_PUBLIC_URL/v1/standin-storage, a middleware, not a registry route): does it exist when
   PROVIDERS=live or NODE_ENV=production (it must not), and does it serve ANY file without a valid signature?
 - The clock offset (HP6): refused at boot in production and with live providers (the real bootstrap); with it set,
   walk one wish through resting, ended and the restore window's end by the real jobs on a stack (the builder did NOT
   run this end to end); nothing reads the wall clock around it (grep new Date( and Date.now( in what the jobs call).
 - Team versions (HP7, HP8): two changes at once: one 200, one 409; a missing version is 422; removing the last owner
   is still refused; removed staff are out of the Team read unless includeRemoved=true, and who may pass that.
 - Role sections (HP1): for each role and a member with two roles, `sections` equals what the section guard enforces
   (try every admin section's read with each role and compare).
 - HP2: an occasion the kind lacks, an unknown one, step -1, 6, 2.5, "2": 422 on the field; valid ones save; older
   drafts with a now-invalid occasion (make one in the database) can still be read and fixed.
 - HP9: `mine` is the caller's own (two people, each sees their own), {} for a visitor and for a bad token (not 401).
 - HP10 and the registry: diff the frozen registry and the contracts file against the base and list EVERY type that
   moved; for each, one request proving the server sends that shape; the follow routes with a body handle: 422 (was
   that body sent by any older test or the web: does anything break?).
 - HP12: people search by wish number never widens what a role may see; day picks for today and 6 days; payoutMonths
   equal the ledger for one creator worked out by hand.
 - The two lows: the stored makerNote bounded at the merged size; a body nested 33 deep is 422 and 32 is accepted.
 - Older tests the builder changed (staff-accounts.contract.spec.ts, test/identity/int1-rulings.spec.ts): read the
   diff: only `version` and `includeRemoved` added, no expectation weakened.
 - The migration applies on a database at the base head with staff rows, is additive; check-drift clean.
 - `npm test -- --maxWorkers=2` once (the builder's one finished run: 122 suites, 1208 tests): totals; gates.sh,
   check-contracts, check-routes; spec file count against the base (none lost).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab4/VERDICT.md (40 lines or fewer). Hand back ONCE in 18 lines or fewer: merge or fix; findings
by severity (blocker, high, medium, low) with file:line; what you could not run.
