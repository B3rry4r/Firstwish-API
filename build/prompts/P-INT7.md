PATCH P-INT7 | TIER T2 money | Budget 45 steps. Close the named rulings only; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HF1-HF3, HD2 in build/rulings-phase3.md, and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int7/VERDICT.md (its probe specs are under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int7/vint7-spec/: read them to reproduce finding 1 first).
Work: commit on local branch `int-7` (68b989e) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-int7 (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-int7
int-7`; `npm ci`); ports 5160-5169; TEST_DB_PREFIX=pint7.
 HF1  draw-giveback.ts: the give-back checks, in the same statement or under the same lock as the claim, that the draw's
      source still stands (the grant of drawPaymentId is live: not revoked, not ended; for a month: the plan payment stands
      and it is still that month); else it marks the record given back with nothing returned. Tests by hand through the real
      routes: pack of 5 paid, 2 drafts drawn, both removed, the pack refunded, the window ends: pack stays 0 and the next
      client wish is 402; the same with the refund AFTER the give-back (the revoke must not leave wishes: say what the
      revoke does to returned wishes and prove pack is 0); a plan refunded mid-month; 20 give-backs racing the refund's
      event: never a wish left on a revoked source.
 HF2  draw-source.ts packSource ignores records with drawnBackAt. Test: pack of 5, one draw given back, 5 more draws: each
      has its drawPaymentId and earns as it should.
 HF3  the logins-over notice's key is the business and its over-plan state, so a second payment while still over sends
      none and a later downgrade after the logins were brought back in line sends one again; the stand-in refund lookup
      matches the amount; Numbers target with no staff row: 403 or 422, never 500. Tests.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, `npm test` (--maxWorkers=2)
twice (name any failing test). Commit on int-7; do not push; remove your worktree and databases. Hand back in 8 lines: the
new head; each id closed or not with file:line and the test's name.
