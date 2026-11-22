BUILDER P7-SMOKE | TIER T1 (tests and tooling; no route's behaviour changes) | Budget 120 steps. Phase 7, the API smoke: every part of the server proves itself alone, from a clean start, and the tools that describe it agree with it.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p7/NOTES.md
as you go and commit at every closed item. Stop only PIDs you started. If the branch, worktree or NOTES.md already
exists, an earlier agent was lost: read them and carry on.
Read /home/user/Firstwish-API/build/common-rules.md, the lists build/sweeps/api.md (rows on gen_schema, the 30-pair tests, "five specs 503
alone") and test/kit/{unique,own-db}.ts. Work: /home/user/Firstwish-API, a new local branch `p7-smoke` from claude/sleepy-mayer-f0hkb8 (the
head in your spawn line) in your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p7-smoke (`npm ci`, prisma generate); ports 5200-5209;
TEST_DB_PREFIX=p7. Run every command with your own worktree as the working directory. Do not edit a gate or a
baseline. A src change is allowed ONLY where an item below names it; anything else you find wrong in src is a
FINDING in your hand-back, not a fix.
 1. Every spec alone. Run each spec file by itself, one after another, each from a database made fresh for it
    (the repo's own runner: read scripts/test-runner.mjs and scripts/db.mjs for how; one worker), with a script
    you write under scripts/ (smoke-alone.mjs: it prints one line per spec: PASS, FAIL or TIMEOUT with seconds,
    and exits non-zero on any FAIL). A spec that fails alone and passes in the full run depends on another
    spec's rows or order: fix the SPEC or its kit (it makes what it needs: the seed, its own rows, its own
    database where it counts shared rows). List every one with its cause. Then the whole list alone again: 0 FAIL.
 2. A clean start. From an EMPTY database: migrate from zero with the repo's migrations in order (no db push),
    seed, start the server on the stand-ins (scripts/stack.sh or how the repo starts it), and with curl: the
    health route, the price book, the public styles list, a sign-in by email code through the stand-in, GET /v1/me:
    each answers as its contract says. Then migrate a second time (nothing to do) and seed a second time (no
    duplicate, no error). Write the exact commands that worked into docs/RUN.md (create it: this is what the
    owner's host will run), with the environment each needs (names only, no values).
 3. The tools agree. (a) scripts/gen_schema.py (or wherever the schema generator lives) no longer reproduces
    the committed prisma/schema.prisma and src/contracts (a checker found 21 files differ): either bring it back
    in step so that running it changes NOTHING in the committed files, or, if the registry-to-code direction is
    no longer how the repo works, say so, delete the generator and its mentions, and make check-drift the one
    guard (say which, and why, in the hand-back; do not hand-edit generated output to match). (b)
    scripts/export-contracts.mjs output equals the committed contract file; check-contracts, check-drift,
    check-routes EXIT 0. (c) .pipeline/registry.json: 285 endpoints; every one is served by a route (check-routes)
    and every route has a spec that calls it at least once (write scripts/smoke-coverage.mjs: it greps the specs
    for each method and path; list the endpoints no spec calls: those are findings, do not write the specs).
 4. The env manifest: .pipeline/env-manifest.json lists every variable the code reads (grep process.env and the
    config module): add what is missing, mark what nothing reads, and say for each whether the server refuses to
    start without it in production (try it: NODE_ENV=production with each one unset).
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, gates.sh, check-contracts, check-drift,
check-routes; then the full suite twice in the FOREGROUND (`WEB_LIB=/nonexistent/lib npm test` and once without
WEB_LIB), both ended before you hand back. Commit on p7-smoke; do not push; remove your worktree and databases.
Hand back ONCE in 12 lines: head; item 1: how many specs, which failed alone and why, the second pass's totals;
item 2: PASS or the first command that failed; item 3: the generator's fate and the endpoints no spec calls;
item 4: the variables added and the ones production refuses to start without; the EXIT and Tests: lines; findings.
