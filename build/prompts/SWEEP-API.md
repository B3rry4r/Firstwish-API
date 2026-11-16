BUILDER sweep | TIER T1 | The API's low findings, in one pass
Budget 150 steps. Machine: 4 CPUs, 15 GB; heavy agent: a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/common-rules.md, then build/prompts/P5-COMMON.md, then build/sweeps/api.md: every line is one low
finding from a verifier, with its file. Rulings outrank code comments: where a line names a ruling, read it in
build/rulings-phase3.md.
Work: local branch `sweep-api` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/sweep-api (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; ports 5070-5079; TEST_DB_PREFIX=sweep.
You may touch src/modules/** and tests; a line that needs a shared change (registry, schema.prisma, src/common, src/contracts):
do not do it, mark it "needs a shared change" with what it needs.
 1. First sort every line of the file into: (a) still true on this head (check the code: many were fixed by later patches
    and joins); (b) already fixed (say by which commit or code); (c) needs a shared change; (d) not a defect (say why).
    Write the table to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/sweep-api-table.md before changing anything.
 2. Fix every line in (a), smallest change that closes it, each with a test named after the line's subject. Money and
    access lines first. Do not widen any behaviour beyond the line.
 3. Rewrite build/sweeps/api.md so it holds only the lines in (c), each with what it needs, under a heading "Left for a
    shared change"; the rest go to build/sweeps/api-closed.md with one line each saying how it was closed.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-routes, check-drift,
`npm test` (--maxWorkers=2) twice (name any failing test). Commit in small commits (one per group of lines); do not push;
remove your worktree and databases. Hand back in 12 lines: head; counts for (a) fixed, (b), (c), (d); the (c) lines; any line
you could not close and why; EXIT lines.
