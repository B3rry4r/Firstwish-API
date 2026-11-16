VERIFIER API-BASE-3 | TIER T2, full | Budget 80 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-3.md (its five cases are the contract), rulings HM1, HM3, HM4,
HM6 in build/rulings-phase3.md, and the claims in your spawn line.
Under test: /home/user/Firstwish-API, local branch `api-base-3` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab3 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab3. Probes as specs under
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab3/ (not in the repo). Remove your worktree and databases when done.
Attack through the real routes (each PASS or FAIL with what you saw):
 - The start (HM3): the same key 20 at once; two different keys at once from one person with no draft; a key reused by
   ANOTHER person (must not hand over the first person's draft); a key reused after its draft was removed, sealed, or
   erased; a key of 1 and of 300 characters and with odd characters; no key at all, twice fast (what happens: one draft
   or two, and is that what the ruling wants?). The wish_start table: what it stores, its erase rule (the AA2 gate), and
   whether it grows without end.
 - Untouched: write down the rule the code uses, then try to break it: a draft with only a kind from a link; a draft the
   web has PATCHed once with its usual body (makerNote.chosen replaced whole: the builder names this edge); a draft with
   a name only; a draft touched then cleared. For each: does a later start hand it back, and would the person be
   surprised (their answers gone, or someone else's kind preset)? A touched draft handed back or silently changed is HIGH.
 - The wire change the builder made beyond the brief: kind, occasion and style are now OPTIONAL on the start with
   defaults (love, birthday, the first style on). Is that in the registry decisions (DEC-214)? Does any older caller or
   test rely on a 422 for a missing kind? Is "the first style on" stable (ordering) and never a style that is off or
   above the person's level?
 - makerNote (HM1): what PATCH saves equals what GET, the list and every wish-shaped owner route give back; staff lists,
   the public link, the receiver's read and the published wish NEVER carry it (list each route you checked); another
   person: 404 and nothing in their list; size limits on makerNote still hold.
 - Wish.content (HM4): diff the frozen registry and the contracts file against the base: list every type that changed,
   not only Wish.content (a generator change can move others); no change on the wire (contract tests).
 - no_session (HM6): no cookie, empty, malformed, a cookie of the other kind (a staff cookie on the person's refresh and
   the reverse), a valid-format cookie that was never issued: which code each gets; ended, reused, erased keep their
   code and words; the answer never says whether an account exists.
 - The outbox: mode 0600 on create and on an existing 0644 file; a directory, a path under a missing folder, a
   read-only folder: a clear error at boot through the real bootstrap; unset: nothing written.
 - The migration: applies on a database at the base head with rows in wish (make 50 wishes first), is additive, and
   check-drift is clean; a down path is not required but say what dropping the table loses.
 - `npm test -- --maxWorkers=2` once (the builder reports 117 suites, 1186 tests): totals; gates.sh, check-contracts,
   check-drift, check-routes; the spec file count against the base (none lost).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab3/VERDICT.md (30 lines or fewer). Hand back ONCE in 15 lines or fewer: merge or fix; findings by
severity (blocker, high, medium, low) with file:line; what you could not run.
