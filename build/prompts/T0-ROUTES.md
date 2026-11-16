BUILDER T0 | A gate: every endpoint in the registry has a route, and every route has an endpoint | Budget 35 steps.
Read /home/user/Firstwish-API/build/common-rules.md, scripts/check-contracts.mjs (how gates read .pipeline/registry.json), src/main.ts
and test/kit/app.ts (how the app is made in tests).
Work: local branch `t0-routes` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/t0-routes (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; TEST_DB_PREFIX=t0routes.
 1. scripts/check-routes.mjs (or a small ts script run with the repo's runner): make the Nest app the way the tests do (no
    listening port needed), read every registered route (method + path with the /v1 prefix; normalise :params) from the
    router, and compare with every endpoint in .pipeline/registry.json (its id, method, path).
    Print three lists: MISSING (in the registry, no route): id, method, path, resource; EXTRA (a route with no registry
    endpoint), and MISMATCH (same path, another method). Health and other kernel routes the conventions name are allowed
    extras: list them in a small allow-list inside the script with a comment each.
    Exit 1 when MISSING or EXTRA is not empty, unless the id or route is in build/baselines/routes-missing.txt (one per line:
    id or "METHOD path" | reason | owner: lead). Do NOT create or fill that baseline file: the lead does. A baseline line that
    no longer applies fails too.
 2. Run it on this head and write its full output to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/routes-report.txt. Do not add it to CI or gates.sh yet (the
    lead does after ruling on the lists); add one row to the README's checks table saying what it does.
 3. For each MISSING id, add one line to the report from `python3 tools/pipeline/show.py endpoint <id>`: which resource and
    screens need it (short).
Checks (quiet logs, EXIT lines): lint on the script, gates.sh. Commit on t0-routes; do not push; remove your worktree and
database. Hand back in 12 lines: head; the counts (registry endpoints, routes, missing, extra, mismatch); the MISSING ids
grouped by resource; the EXTRA routes.
