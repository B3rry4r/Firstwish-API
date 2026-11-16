PATCH join 4 fix | TIER T2 | Budget 30 steps. Close RR4 only; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, rulings RR3 and RR4 in build/rulings-phase3.md, and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/join4/VERDICT.md (finding 1).
Work: commit on top of local branch `p-join4` (96bc81d) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join4b (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join4b p-join4`; `npm ci`); ports 4680-4689; TEST_DB_PREFIX=pjoin4b.
 RR4  The code that makes a client wish (src/modules/pro-business/client-wishes.service.ts, through WishesService if that is
      how it creates the wish) writes wish.businessId in the same transaction. A plain user still cannot set it (422 stays).
      Tests, through the real routes with no row set by hand: a business owner makes a client wish by the client-wish route,
      seals and sends it; the owner is erased; the receiver's link still plays; at the end of the term the wish is erased.
      A login (not the owner) makes one: the same. Change the join's J5 specs that set businessId by hand to use the route
      where that is simple; leave the rest.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, `npm run test:affected -- src/modules/pro-business
src/modules/accounts src/modules/wishes src/modules/public-wishes` twice, then `npm run test:affected -- src/modules src/common test`
once. Commit on p-join4 (do not push); remove your worktree and databases. Hand back in 6 lines: the new head, RR4 closed or
not with file:line and test names, EXIT lines, counts.
