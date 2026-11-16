BUILDER INT-6 | TIER T2 | The closing base of Phase 5: one last registry reopen, one small migration, a ping on every port
Budget 150 steps. Machine: 4 CPUs, 15 GB; heavy agent. You own the shared parts for this task: .pipeline/** through the tools,
prisma through schema-map.json + gen_schema.py and ONE new migration, src/common/**, test/kit/**, scripts/**, the seed,
build/baselines/** (remove a line when it no longer applies; never add one); and you may touch src/modules/** only where a
shared change forces it (list each touch).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-5.md (how the last one was done), then in
build/rulings-phase3.md the lines FB1, FB2, FB4, GA2, GC1, GC2, GD4, HA1, HA3, HC2, HD2, ZB4 (ClientWish.wishId in the contract), CB4, and
any line the lead adds to this brief below.
Work: local branch `int-6` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API; worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-int-6 (`npm ci`); ports 5050-5059; TEST_DB_PREFIX=int6 for every run.
 1. Registry, ONE reopen (list every id before you start): FB1 (E-4 answers {phone, email} once), FB2 (Numbers.lines is a
    list of {line, name, definition, amount}), GC1 (E-12 and E-14 take transcript, voiceFileId optional; any signed-in
    person; AiRequest's fields by kind), GD4 (E-51 for any signed-in person), HA1 and HA3 (E-228 and E-232 take the wish's
    link and unlock token in the headers x-wish-link and x-unlock-token; who may call), the extra fields of E-83 and E-64 as
    the code answers them, ClientWish.wishId, GA2 (E-89 and the declared concierge.rush price-book line are removed: rush is
    not sold; an endpoint id that is removed is never reused). Decisions citing the ids, `reconcile.py --reopen "<ids>"` twice
    identical, 0 open conflicts, both ADMIN lines 0, then freeze.py. Regenerate contracts; the local DTOs the bundles wrote
    around these gaps are replaced by the generated ones where it is a small change (else leave it and say so).
 2. Schema, one migration: GC2 (ai_request.voiceFileId: deleting or erasing the voice file clears the link); anything the
    reopen forces. Tried on rows shaped like live data; check-drift passes with an empty baseline.
 2b. HD2 (ruling in build/rulings-phase3.md): ClientWish gains the source of its draw (month or pack, and the payment it was
    counted against); the business draw writes it at the draw; the royalty accrual at the seal reads it instead of working
    the source out at seal time. Test with the verifier's case by hand: April Starter with 4 used, May Studio (6 rolled),
    8 sheet wishes drawn then all sealed in a creator's Premium style: six earn 70,000 and two earn 60,000; the usePlan
    seal (draw and seal together) is unchanged. Also HC2: a \`cancelled\` job status used by JobsService.cancel; the
    schema-map erase rule for ClientWish.reveal says blanked at the end of the term.
 3. Kernel: every provider port (payments, refunds, payouts, email, storage, AI, screening, video render) gains ping(): the
    real adapter makes one cheap authenticated read and answers ok or the provider's error; a stand-in answers "stand-in".
    The staff Providers read shows connected ONLY when the real adapter is configured AND its ping succeeded now (cached for
    a minute), never from old evidence rows (FB4). No secret in any answer or log. NOT RUN against real providers: say so.
 4. Gates: `node scripts/check-routes.mjs` and `node scripts/check-drift.mjs` pass with EMPTY baselines (remove the stale
    lines); check-contracts passes on the new lock.
 5. Everything compiles and every spec passes on the new base.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, check-drift, check-routes, seed
twice, check-contracts, gates.sh, `npm test` (the full suite, --maxWorkers=2) three times (name any test that failed in any
run and why).
Do not push; remove your worktree and databases. Hand back in 12 lines: head sha; each ruling id closed or not; touches in
bundle code; counts (resources, endpoints, routes, tests); what was NOT RUN against a real provider; any HALT; EXIT lines.
