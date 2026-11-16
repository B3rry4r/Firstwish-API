PATCH P-API-BASE-3 | TIER T2 the wish | Budget 45 steps. Close the named rulings only; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HO1, HO2, HO3 (and HM3, which HO1 revises) in build/rulings-phase3.md, and the
verifier's file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab3/VERDICT.md (its probe specs are beside it: reproduce the two HIGH findings FIRST
as failing tests).
Work: commit on local branch `api-base-3` (8557439) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab3 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab3 api-base-3`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab3.
 HO1  A start never changes an existing draft. Handed back: only a draft made by a bare start and never written since
      (say how that is known: its version, or a column set at the start; no derived content test), only to another bare
      start, byte for byte unchanged (name and cover too). A start carrying a kind, occasion or style always makes a new
      draft unless its key repeats. Tests: PATCH kind then start with another kind: a NEW draft, the old one unchanged;
      the web's usual PATCH then a start: new draft; bare start twice: the same draft; bare then PATCH name then bare:
      a new draft; 10 bare starts at once: one draft; the verifier's two cases.
 HO2  A remembered key whose wish is removed, sealed or erased: 409 key_spent with words (registry: the code listed
      where error codes are; a decision citing HO2 if the registry must reopen: then ONE reopen, reconcile twice
      identical, freeze). The same key while still a draft: 200 the same draft.
 HO3  The makerNote size check runs for every note (find the limit the contract or conventions give; a note over it
      is 422 naming the field); an older test that saved an over-size note is a HALT line, not an edit.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-drift, check-routes,
`npm test -- --maxWorkers=2` twice (the reference-data "seed equals the web app's own files" test fails on this machine
because the web checkout moved: report it apart, do not touch it). Commit on api-base-3; do not push; remove your
worktree and databases. Hand back ONCE in 8 lines: head; each id closed or not with file:line and the test's name; totals.
