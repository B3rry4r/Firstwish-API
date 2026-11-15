PATCH SCHEMA round 1 | TIER T2 | Budget 70 steps. Reopen the registry for four rulings, re-freeze, regenerate. Nothing else.
Read /home/user/Firstwish-API/build/common-rules.md and the LAST section ("Registry reopened once", P1 to P4) of
/home/user/Firstwish-API/build/rulings-phase3.md (read it from that path: it is newer than your branch's copy; do not edit build/**).
Branch `api-schema` (head 88ef07b) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-api-schema (`npm ci`); ports 4050-4059; database prefix psch.
Do, in this order:
 1. Append decisions for P1 to P4 to .pipeline/decisions.json (same shape as DEC-125..130; approvedBy "lead default, owner may
    override", P4 cites R11), with the route, field and alias table entries and the smallest change to tools/pipeline/reconcile.py they
    need. Run it twice: identical sha256, EXIT 0, OPEN CONFLICTS 0, the two ADMIN gate lines 0.
 2. Write tools/pipeline/freeze.py: sets registry.json's frozenAt (UTC now, to the second), writes .pipeline/registry.lock.json
    (frozenAt, registrySha256, resources, endpoints, decision id of the freeze: add a decision "registry re-frozen after P1 to P4").
    reconcile.py must refuse to run (exit 2, a clear message) when registry.lock.json exists, unless called with --reopen "<ruling ids>".
 3. Re-run tools/pipeline/gen_schema.py; add NumbersTarget (config) to schema-map.json; a NEW migration (never edit a migration
    already made); the seed stays byte-identical on two runs; contracts regenerated; `npm run contracts:export`.
 4. HALT-2: keep the skipped edge; record it in schema-map.json citing the P2 decision id.
Checks (quiet logs, EXIT lines): build, typecheck, lint, `prisma migrate deploy` on a fresh database, migrate diff shows no drift, seed
twice, check-contracts (the new lock), gates.sh, the affected specs plus one new spec: a payment-start body with `amount` is refused
as an unknown field (422), and a code request with channel "sms" is refused.
Commit on `api-schema` (do not push); remove your worktree and databases. Hand back in 8 lines: head sha; each of P1 to P4 applied
or not with proof; counts (resources, endpoints, tables); any new conflict left open; EXIT lines.
