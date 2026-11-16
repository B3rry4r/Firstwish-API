PATCH P-API-BASE-2 | TIER T2 money | Budget 45 steps. Close the named rulings only; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md and rulings HG1, HH1, HH2, HH3 in build/rulings-phase3.md.
Work: commit on local branch `api-base-2` (e443418) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab2
(`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab2 api-base-2`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab2.
 HH1  The older tests that send a Concierge give with no `expectedMaker` (concierge.spec.ts, pb19.spec.ts, any other: grep
      the give route) send the maker the test saw (empty string when the order had none). Only that field is added; no
      expectation changes. If a test then fails for another reason, do not bend it: report it.
 HH2  int7-give-back.spec.ts (three tests) builds its pack by a real stand-in payment (as the pack tests in
      src/modules/pro-business/tests do) instead of setting business.pack by hand; expectations unchanged.
 HH3  reference-data.spec "the seed equals the web app's own files" fails on this machine since the web head moved
      (WEB checkout /home/user/Firstwish-web at 71113ca; changed: lib/account.ts, lib/engine/types.ts, lib/studio.ts). Find
      how the seed is drawn from those files (prisma/seed-data, its SOURCE.json, the T0 web-files change 4da4567), re-draw
      it from the web head, and say exactly what changed in what the API serves (quote each changed value; "nothing" is a
      fine answer if only code or copy outside the seed moved). Then refresh SOURCE.json. Do not edit the web repo.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-drift, check-routes,
`npm test -- --maxWorkers=2` twice (name any failing test; 0 failed is the bar, the web-files test RUNS here). Commit on
api-base-2; do not push; remove your worktree and databases. Hand back in 8 lines: the new head; each id closed or not with
file:line; the two test totals; for HH3 the changed values.
