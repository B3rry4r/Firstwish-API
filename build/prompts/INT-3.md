BUILDER INT-3 | TIER T2 | Wave 3, the shared base: merge payments and the wish, reopen the registry once, schema and kernel changes
Budget 190 steps. Machine: 4 CPUs, 15 GB; heavy agent. You own the shared parts for this task: .pipeline/** through the tools,
prisma through schema-map.json + gen_schema.py and ONE new migration, src/common/**, test/kit/**, scripts/**, the seed.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-2.md (how the last one was done),
then in build/rulings-phase3.md: "Wave 3 list" (BB1-BB8), the CC and DD lines (CC1-CC6, DD1-DD5), "From Verify B06" (EE1-EE9),
"From Verify B05" (FF1-FF6).
Work: local branch `int-3` from claude/sleepy-mayer-f0hkb8 (head f755607 or later) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-int-3
(`npm ci`); ports 4470-4479; database prefix int3. First merge, each with --no-ff, the local branches b05-payments and
b06-wish-core (both were cut from earlier states of this wave's base: fix only what the merge itself breaks; keep both blocks in
src/app.module.ts).
YOUR part (the shared base). The per-bundle rulings are NOT yours: two patch builders do them on top of your branch afterwards.
 1. Registry, one reopen: BB1 (approved-dates routes), BB8, CC1, CC2, DD2 (GET /v1/payments), EE5 (seal body: openNow), and the
    wish read shapes EE7 needs (openedAt, endsAt, an `openable` flag) if they are missing: decisions citing the ids, route and
    shape tables, `reconcile.py --reopen "<ids>"` twice identical, 0 open conflicts, both ADMIN lines 0, then freeze.py.
    Endpoint ids already issued never change.
 2. Schema, one new migration through schema-map.json and gen_schema.py: BB1 (approved_date.businessId, foreign key), CC3 (the
    lifecycle config value wishContentMaxBytes 262144, PROVISIONAL, in the seed), CC4 (a unique index on job type + subject key),
    DD3 (payment.flags text list; webhook_event.outcome), EE1 (what a per-run time limit needs: per-kind limit in config),
    EE7/EE8 (whatever the wish needs to hold openedAt once and a wedding date as its term anchor, if missing), erase rules for any
    new text column (the AA2 gate must pass). Regenerate contracts; contracts:export.
 3. Kernel: EE2 (ill-formed text such as a lone surrogate is 422, in the same global check), FF1 (a time limit on every provider
    port call: one wrapper, per-port limit from config, with tests using a stand-in that never answers), FF6.
 4. The joins only a shared base can make: register with the jobs frame (JobsService.register) the handlers other bundles
    exported: abandon-payment (B05), upload_cleanup and make_image_sizes (B09); schedule the recurring ones as the jobs frame
    allows; a test per handler that the tick really runs it. Re-prove on the merged base, with tests named by id: X10/J1/J2
    (erasing an account kills its wishes' links, jobs, files and saves) and Y1 (a PUT with an old signed URL cannot change a file a
    sealed wish names).
 5. Make everything compile and every bundle's own specs pass on the new base, changing bundle code only where your shared change
    forces it. List each such touch in the hand-back.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, migrate diff no drift, seed twice,
check-contracts (new lock, the erase gate), gates.sh, `npm run test:affected -- src/modules src/common test` three times (name any
test that failed in any run).
Do not push; remove your worktree and databases. Hand back in 12 lines: head sha; each ruling id of YOUR part closed or not; the
list of touches in bundle code; counts (resources, endpoints, tests); any HALT with its two sources; EXIT lines.
