BUILDER P-API-16B | TIER T0 (one reference row and its tests) | Budget 30 steps. The server holds 44 sample wishes; the web has 45 recipes. Add the missing one; change nothing else.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f; final runs in the FOREGROUND.
Read /home/user/Firstwish-API/build/prompts/API-BASE-16.md (how the sample table is seeded once from the web and then OWNED by the API) and
the row "W15C-S1 (23 Nov)" in /home/user/Firstwish-API/build/sweeps/api.md.
Work: /home/user/Firstwish-API, local branch `p-api-16b` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-api-16b (`npm ci`, prisma generate); TEST_DB_PREFIX=pa16b.
 1. FIRST say why it is missing: the web's recipes are in /home/user/Firstwish-web/lib/occasions.ts (photographers / your-finals at about
    line 276); the samples were made for every kind by occasion of the catalogue the seed knows: which list lacks
    "your-finals", and is any OTHER recipe of the web missing from the 44 (list the web's recipes kind by slug
    against the seed's rows: every difference, both ways)?
 2. Add each missing sample as a row of prisma/seed-data/SampleWish.json, by hand, with the words the web's source
    gives for it (the sample content as it stood at web commit b3f1844: `git -C /home/user/Firstwish-web show
    b3f1844:lib/engine/adapt.ts` has sampleContent; your-finals carries links.download with the eight sample
    photos, count 8 and its size words); the same shape as the other rows; the seed twice changes nothing.
 3. If the catalogue the server serves (the occasions of a kind) also lacks that occasion, say so and STOP there
    for that part: do not add an occasion to the catalogue (that is another task): only the sample row.
 4. Tests: the count becomes 45 (or what item 1 finds); E-288 for the new one answers the sample in the open-view
    shape with its download links; the existing sample specs pass.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, scripts/gates.sh, check-contracts,
check-drift, check-routes, the sample-wishes and reference-data specs, then `WEB_LIB=/nonexistent/lib npm test --
--maxWorkers=2` once: 0 failed. Commit on p-api-16b; do not push; remove your worktree. Hand back ONCE in 6
lines: head; item 1's answer; rows added; totals.
