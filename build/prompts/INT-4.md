BUILDER INT-4 | TIER T2 | Wave 4, the shared base: one registry reopen, schema and kernel changes, and the joins they force
Budget 190 steps. Machine: 4 CPUs, 15 GB; heavy agent. You own the shared parts for this task: .pipeline/** through the tools,
prisma through schema-map.json + gen_schema.py and ONE new migration, src/common/**, test/kit/**, scripts/**, the seed; and you may
touch src/modules/** only where a shared change forces it (list each touch).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-3.md (how the last one was done),
then in build/rulings-phase3.md the lines GG1-GG7, HH8, II2-II6, JJ1, LL1-LL5, MM1, NN7, and the last row of build/sweeps/api.md.
Work: local branch `int-4` from claude/sleepy-mayer-f0hkb8 (head 8692576 or later) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-int-4
(`npm ci`); ports 4670-4679; TEST_DB_PREFIX=int4 for every run.
 1. Registry, one reopen: GG3 (a Pass upgrade route if the registry has none: POST /v1/wishes/:id/pass-upgrade, signed in),
    GG5 (seal body: usePass), GG7 (E-225: passcode in, legacy whole-wish fields out), HH8 (the start body's ticket takes every
    ticket id), II2 (E-75, E-76 answer a real MessageTemplate shape), II4 (Account.timeZone, read and set through /v1/me),
    LL2 (E-132 answers {reaction, counts}; E-134 answers {ok, token, expiresAt} or {ok: false, error}; PublicWishView gains
    files and, while sealed, opening), LL3, NN7 (E-131 answers PublicWishView), the wish detail's `activity`. Decisions citing
    the ids, route and shape tables, `reconcile.py --reopen "<ids>"` twice identical, 0 open conflicts, both ADMIN lines 0, then
    freeze.py. Endpoint ids already issued never change.
 2. Schema, one new migration through schema-map.json and gen_schema.py, tried on rows shaped like live data: GG1 (purchase_grant
    as a model), LL1 (WishOpen's new columns, wish_reaction, wish_favourite, link_hit as models), II3 (a unique index on
    message_delivery.idempotencyKey), II4 (account.timeZone), II5 + MM1 (the delivery purpose gains sealed and opens; the
    status gains sending and dropped), erase rules for every new text column (the AA2 gate must pass), the seed: an "invite"
    message with its own wording (plain short words; the owner's rules). Regenerate contracts; contracts:export.
 3. Kernel: JJ1 (the JSON body limit is a config value, 512 KB; an oversize wish gets the service's 422, test it over HTTP).
 4. The joins the shared changes force, each with a test named by its id: GG2 (the wish bundle's fulfilTicketIn(tx, ...) used by
    the ticket handler), GG3 (payments' start calls PurchasesService.assertStartable; a ticket line for a wish that has a ticket
    is 422; a Pass upgrade draws one upgrade and makes the wish a Signature, 20 at once with 1 left: one), GG4 (business.pack is
    wishes left; the files bundle's Vault limit = the plan's GB + the GB of live grants), GG5 (seal with usePass draws one Pass
    wish in the seal transaction; 20 at once with 1 left: one seals), II3/MM1 (notices use the unique index and the new status
    values; the advisory lock and the stand-in statuses go), II4 (notices use the account's zone, else the wish's), LL4 (old
    link_hit rows removed by a timed job registered with the jobs frame), staff invites use the "invite" message, raw SQL on the
    tables that became models replaced by the models where it is a small change (else leave it and say so).
 5. Everything compiles and every bundle's specs pass on the new base.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, migrate diff no drift, seed twice,
check-contracts (new lock, the erase gate), gates.sh, `npm run test:affected -- src/modules src/common test` three times (name any
test that failed in any run and why).
Do not push; remove your worktree and databases. Hand back in 12 lines: head sha; each ruling id closed or not; touches in bundle
code; counts (resources, endpoints, tests); any HALT with its two sources; EXIT lines.
