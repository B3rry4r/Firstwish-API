VERIFIER join 6 patch re-check | TIER T2 | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HC1, HD1, HD3, RR3, EA3 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/join6/VERDICT.md and its specs (*.spec.ts.txt in the same folder: reuse them).
Under test: local branch `p-join6` at 9b95bf0 against 22f7dbe: the diff of the two is all you check. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pjoin6 (detached at 9b95bf0; `npm ci`); ports 5060-5069; TEST_DB_PREFIX=vpjoin6; a clock in 2207; your own addresses;
remove both when done; kill by PID.
Check by id, each PASS or FAIL with what you saw:
 HD1  a login erases their own account: scan every table for their email and name (your own scan): none; the business and
      its other logins are untouched.
 HC1  after the owner's erase a reveal that is on and inside its term plays WITH its photos (fetch the signed address from the
      stand-in storage: bytes come back); a file no playing reveal shows is removed; at the term's end the file's bytes and
      row are gone and the link answers gone; a reveal with no end on its client wish follows its link's end; a link with
      no end at all: say what its term is (a reveal that plays for ever after an erase is a MEDIUM).
 HD3  20 sheet wishes, 10 date wishes and 10 usePlan seals in flight while the login is removed, five rounds: every wish
      made is the owner's, the removed login reads none, draws equal wishes; POST /v1/business/client-wishes and DELETE of a
      login under 30 at once, 30 rounds: never 500, no deadlock in the database log (count deadlocks before and after).
      The lock order changed in the seal (the owner's lock first): the ordinary seal, the Pass seal and the ticket seal
      under 20 at once still behave as before (run their specs and one race each).
 The flake the builder saw: src/modules/vault/tests/vault.spec.ts "20 at once near the edge" once gave 4 refusals where 5
      were expected (one upload too many landed). Run that test 20 times while `npm test` runs beside it; if it fails, find
      whether the Vault's limit can really be passed (count stored bytes against the limit in the database after the run:
      over the limit is a HIGH) or the test counts another spec's rows; give the cause with file:line.
 Also: the first verdict's PASS list still holds (run your earlier join6 specs; say what changed).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm test` (--maxWorkers=2) twice (name any failing test).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/join6/VERDICT-P.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
