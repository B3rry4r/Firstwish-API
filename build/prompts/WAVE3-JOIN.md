PATCH wave 3 join | TIER T2 | Budget 90 steps. The last joins between this wave's bundles. Keep the diff small.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, and in build/rulings-phase3.md: MM2, MM3, NN7, LL5, II6,
HH5; the last two rows of build/sweeps/api.md (B07 lows).
Base: local branch `int-3` (the lead gives its head in the spawn line): payments, the wish, what a payment buys, email and the
receiver's link are all merged in it with their patches. Work: local branch `p-join3` from int-3; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join3
(`npm ci`); ports 4660-4669; TEST_DB_PREFIX=pjoin3 for every run. You may touch src/modules/** only; a shared change you need
(src/common, .pipeline, prisma, src/contracts): HALT AND REPORT.
 J1 (MM2): a delivery left in flight past its stale time with all three tries used is marked failed for staff by the sweep; a
    retry is taken only once its wait has passed. Test: a sender that dies on its third try ends failed, never in flight for good.
 J2 (HH5): the settle's erased-account branch also sets refund_due in payment.flags. Test.
 J3 (NN7): a reaction may hold a zero-width joiner inside an emoji sequence; a direction override or a zero-width space is 422.
 J4 (LL5): the owner's wish detail shows opens, plays, reactions, favourites and shares through ReceiverActivityService.summary
    (only the owner's own wishes; another account's wish stays 404). Test.
 J5 (II6): identity sends its sign-in code through notices.send and deliverNow after its transaction (users AND staff codes): one
    path for every email; a failed send does not undo the code. The existing identity tests still pass (the code still reaches
    the email stand-in, the limits still hold, timing for known and unknown emails stays within 2 ms: re-run U4's test).
 J6 (MM3): the specs that call jobs.runDue() with no keys (wishes.contract.spec.ts, jobs.spec.ts and any other: grep) pass the
    keys they mean, on a clock no other spec reaches.
 J7 (sweep): the keep label is the longest keep that remains; only an active login counts as the business's own.
Checks (quiet logs, EXIT lines): build, typecheck, lint on changed files, gates.sh, check-contracts, migrate deploy on a fresh
database, `npm run test:affected -- src/modules src/common test` THREE times (a failure in any run is a finding: name the test and
its cause); then `scripts/stack.sh up pjoin3 4660`, GET /v1/health and one unauthenticated call per new module (401 or 404 in
the envelope), then down.
Commit (do not push); remove your worktree and databases. Hand back in 8 lines: head sha; J1 to J7 closed or not with test names;
any test that failed in any of the three runs and why; counts (tests, suites); EXIT lines.
