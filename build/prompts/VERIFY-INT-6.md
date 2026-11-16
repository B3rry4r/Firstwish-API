VERIFIER INT-6 | TIER T2, the closing base | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-6.md (its steps are the contract), and
in build/rulings-phase3.md: FB1, FB2, FB4, GA2, GC1, GC2, GD4, HA1, HA3, HC2, HD2, HE1, ZB4.
Under test: local branch `int-6` at 3982e6c of /home/user/Firstwish-API against 01a1c92 (`git diff --stat` first). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-int6 (detached at 3982e6c; `npm ci`); ports 5080-5089; TEST_DB_PREFIX=vint6; a clock in 2208; your own addresses;
remove both when done; kill by PID.
Known and NOT findings (HE1): the seed resets the payout threshold on every run; int1-rulings U1 and join4 J1 can fail when
specs share the database; real providers never run; the video renderer has no real adapter.
Attacks:
 - The gates: `git diff 01a1c92 int-6 -- scripts/ tools/pipeline/ .github/ build/baselines/`: no gate weaker; both baselines
   empty; check-routes and check-drift fail on a made-up missing route and a made-up raw table (scratch copy).
 - The registry: E-89 is gone and its id is not reused; every other id is unchanged (compare the two lock files' endpoint
   ids); 253 endpoints; the generated contracts equal the registry (check-contracts) and, for E-4, E-12, E-14, E-51, E-83,
   E-228, E-232 and Numbers, one real call each returns the registry's shape (raw JSON).
 - FB1: the contact reveal answers {phone, email} once per call, only to the roles the registry names, still limited to 20 an
   hour per staff member, with one audit row that holds no value; an erased account reveals nothing.
 - HD2 by hand through the real routes: the verifier's case (April Starter with 4 used, May Studio, 8 sheet wishes drawn then
   sealed in a creator's Premium style: six at 70,000 and two at 60,000); a pack bought at one price and another at another
   price, wishes drawn from both then sealed in the other order; a draw whose payment is refunded before the seal (nothing
   earned, or earned then reversed: say, and the balance by hand); a record with no source (made before the migration)
   falls back and earns once; a wish cannot earn twice.
 - Ping: with stand-ins every port answers "stand-in" and the Providers read says not connected; with PROVIDERS=live and a
   local HTTP server standing in for each provider: ok shows connected; an error, a time-out, a wrong key show not
   connected with a short reason and NO secret (search every answer and the log for the key you configured); the cache is a
   minute; a ping never moves money, sends an email or stores a file (count rows).
 - HC2: a cancelled job is never run, can be scheduled again, and the keep-settle order from HB4 still works.
 - GC2: deleting and erasing a voice file named in an AI request works and clears the link.
 - The migration: on a database at 01a1c92's last migration with live-shaped rows in every table it touches: no row lost;
   migrate diff no drift; deploy twice is a no-op.
 - The test the builder changed in wishes.contract ("50 sealed at once" now checks for a real gap): does it still fail when a
   number is skipped (make one: say how you proved it)?
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, check-drift, check-routes, migrate deploy on
a fresh database, seed twice, `npm test` (--maxWorkers=2) twice (name any failing test and whether it is one of the two known).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int6/VERDICT.md (35 lines or fewer). Hand back in 18 lines or fewer: merge or fix; findings by severity with file:line.
