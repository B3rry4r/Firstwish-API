MERGE wave 5 + Vault | TIER T1 (mechanical) | Budget 35 steps. Merge two verified branches onto the work branch's head. Write
no new behaviour.
Read /home/user/Firstwish-API/build/common-rules.md.
Work: local branch `p-merge5` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API, in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-merge5 (`npm ci`); never check out or commit on claude/sleepy-mayer-f0hkb8 itself; ports 4920-4929;
TEST_DB_PREFIX=pmerge5.
 1. `git merge --no-ff p-join5` (9e13fa6), then `git merge --no-ff b18-vault` (70a2464). End every merge commit message with
    the two trailer lines the other commits carry (Co-Authored-By and Claude-Session: copy them from `git log -1`).
 2. Where both sides added something, keep both: the notices catalog and seed hold every message of both sides (the
    "reveal" message too) and the notices specs' lists count them; src/app.module.ts keeps every block; link-limits and
    public-wishes keep the Vault's shared countTry with whatever the join changed. Never drop a side's test. A conflict that
    is not "keep both" (two sides changed the same logic): STOP and report it with the file and the two versions.
 3. Checks (quiet logs, EXIT lines): typecheck, build, lint on files with conflicts, gates.sh, check-contracts, migrate deploy
    on a fresh database, `node scripts/check-drift.mjs` (the baseline already lists this wave's raw-SQL tables: it must
    pass; if it names a table that is not listed, report it, do not edit the baseline), `npm run test:affected -- src/modules
    src/common test` twice (name any failing test).
Commit (do not push); remove your worktree and databases. Hand back in 8 lines: head sha; the conflicts and how each was
kept; EXIT lines; counts (suites, tests); any failing test.
