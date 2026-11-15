BUILDER INT-2 | TIER T2 | Wave 2, the shared base: merge four bundles, reopen the registry once, schema and kernel changes
Budget 200 steps. Machine: 4 CPUs, 15 GB; heavy agent. You own the shared parts for this task: .pipeline/** through the tools,
prisma through schema-map.json + gen_schema.py and ONE new migration, src/common/**, test/kit/**, scripts/**, the seed.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-1.md (how the last one was done),
then in build/rulings-phase3.md the sections from "Wave 2 halts" (X1-X29) to "From Verify B02" (Y1-Y5, Z1-Z4, AA1-AA6).
Work: local branch `int-2` from claude/sleepy-mayer-f0hkb8 of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-int-2 (`npm ci`); ports 4310-4319;
database prefix int2. First merge, each with --no-ff, the local branches b14-styles, b04-price-book, b02-account-sides, b09-files
(keep every bundle's block in src/app.module.ts; B09's migration stays as it is; fix only what the merge itself breaks).
YOUR part (the shared base). The per-bundle rulings are NOT yours: four patch builders do them on top of your branch afterwards.
 1. Registry, one reopen: X1, X2, X3, X6, X7, X11, X13, X14, X15, X20, X24, X25, X28 (decisions citing the ids, route and shape
    tables, `reconcile.py --reopen "<ids>"` twice identical, 0 open conflicts, both ADMIN lines 0), then freeze.py. Endpoint ids
    already issued never change.
 2. Schema, one new migration through schema-map.json and gen_schema.py: X4 (event key, index), X9, X23 (every *FileId a uuid with
    a real foreign key; drop B09's triggers in this migration), Y5 (a wish-to-file join table with foreign keys and a role), AA2
    (the erase rules for every text and json column of every owned table; add the gate to scripts/check-contracts.mjs), the seed:
    X8 (the house account, handle firstwish, creator side, cannot sign in), X16 (ops reads /admin/prices), Z2 (concierge.rush out).
    Regenerate contracts; contracts:export.
 3. Kernel: X21 (screening result: score, labels), X22 (the image-sizes port moves to src/common/ports with its stand-in; no real
    adapter yet), X26 (signed upload binds content length and type; the stand-in token is random where it makes keys), AA1 (the
    account-lock helper, exported, with its own tests), AA3 (the control-character check, global), AA4 (a link normaliser), AA6.
 4. Make everything compile and the four bundles' own specs pass on the new base, changing their code only where your shared
    change forces it (a renamed type, a moved port, a column that became a uuid). List each such touch in the hand-back.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, migrate diff no drift, seed twice,
check-contracts (new lock, the erase gate), gates.sh, `npm run test:affected -- src/modules src/common test` twice (no flake).
Do not push; remove your worktree and databases. Hand back in 12 lines: head sha; each ruling id of YOUR part closed or not; the
list of touches in bundle code; counts (resources, endpoints, tests); any HALT with its two sources; EXIT lines.
