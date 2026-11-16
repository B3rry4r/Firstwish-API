BUILDER INT-7 | TIER T2 | The API's leftovers: the lines that need a shared change, the lows from the sweep's check, one open line
Budget 140 steps. Machine: 4 CPUs, 15 GB; heavy agent. You own the shared parts for this task: .pipeline/** through the tools,
prisma through schema-map.json + gen_schema.py and ONE new migration, src/common/**, test/kit/**, scripts/**, the seed; and
src/modules/** where a line needs it (list each touch).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-6.md (how the last base was done),
then build/sweeps/api.md (every line in it is yours) and the rulings it names in build/rulings-phase3.md.
Work: local branch `int-7` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API; worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-int-7 (`npm ci`); ports 5160-5169; TEST_DB_PREFIX=int7 for every run.
 1. The five lines under "Left for a shared change", each as its line says (a registry reopen only if a line truly needs the
    wire to change: ONE reopen, decisions citing the line, reconcile twice identical, freeze; ids already issued never change).
 2. The lows "From the sweep's check", each with a test that fails before and passes after.
 3. The open line: a business's draft client wish that is removed for good (its restore window ends, or it is erased) gives
    its drawn wish back: the month's count goes down by one only if the draw was in the month still running, a pack wish
    returns to the pack; never below zero, never more than was drawn, once per wish (20 at once); a wish that was sealed
    gives nothing back. The draw's source is on the client-wish record (ruling HD2). Tests by hand through the real routes.
 4. Both baselines stay empty; every gate passes; build/sweeps/api.md ends holding only what you could not close, with why.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, check-drift, check-routes, seed
twice, check-contracts, gates.sh, `npm test` (--maxWorkers=2) three times (name any test that failed in any run and why).
Commit after each numbered step; do not push; remove your worktree and databases. Hand back in 12 lines: head; each line
closed or not with the test's name; touches; counts; any HALT; EXIT lines.
