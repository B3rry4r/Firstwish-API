BUILDER INT-1 | TIER T2 | Identity, joined: merge B01 (sign-in) and B03 (staff, audit), reopen the registry once, close every finding
Budget 220 steps. Machine: 4 CPUs, 15 GB; heavy agent. You may read both builders' code freely; you own all of it now.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md (as lead of this task you MAY edit src/common/**,
test/kit/**, .pipeline/** through the tools, prisma via gen_schema and NEW migrations), .pipeline/conventions.md, then in
build/rulings-phase3.md the four sections "From B03's halts" (S1-S6), "From B01's halts" (T1-T6), "From Verify B03" (U1-U8),
"From Verify B01" (V1-V9); then /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b03/VERDICT.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b01/VERDICT.md.
Work: local branch `int-1` from claude/sleepy-mayer-f0hkb8 of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-int-1 (`npm ci`); ports 4180-4189;
database prefix int1. First `git merge --no-ff b01-sign-in` then `git merge --no-ff b03-staff-audit` (both are local branches; keep
both blocks in src/app.module.ts).
Do, in this order, committing at each step:
 1. Registry: decisions for S4, S5, S6, T1, T2, T3 (lead default; cite the ruling ids), route and shape table entries,
    `python3 tools/pipeline/reconcile.py --reopen "S4,S5,S6,T1,T2,T3"` twice (identical, EXIT 0, 0 open conflicts, both ADMIN gate
    lines 0), then tools/pipeline/freeze.py with a new freeze decision. conventions.md: T4 and V1, V2 (auth model text).
 2. Schema: S2, S3, U7 and anything V1/V2 need (a family id and a grace record on sessions) through schema-map.json and
    gen_schema.py in ONE new migration (never edit an old one); regenerate contracts; contracts:export.
 3. Kernel: ONE access-token issuer and verifier in src/common/auth, bound in CommonModule, for user and staff tokens (S1, T5, V1);
    the Google port, adapter and stand-in in src/common/ports (T5); the test kit's id stand-in never repeats across apps sharing a
    database (T6); test:affected accepts a directory (U8); TRUST_PROXY_HOPS (V4, also in .pipeline/env-manifest.json with
    NODE_ENV, PORT, PROVIDERS, INTERNAL_TOKEN: build/sweeps/api.md's first row, then fix the env spec lists as it says).
 4. Both modules on top of that: the staff refresh route (S5); audit section and reason columns used, the section filter (S2, S4);
    removed as its own state and re-invite (S3, U5); U1 and U2 in BOTH sign-ins (staff and user: one shared helper); U3, U4, U6;
    V2 to V9. Every finding of both VERDICT files is closed or, where you judge it wrong, answered with evidence.
 5. Tests for each ruling by its id in the test name (a real database; parallel cases really in parallel), including: 10 wrong + 1
    right code at once is refused for both sign-ins; with the Redis port dead, code limits still hold for both; 6 refreshes at once.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, migrate diff no drift, seed twice,
check-contracts (new lock), gates.sh, `npm run test:affected -- src/modules src/common test` twice (no flake), then
`scripts/stack.sh up int1 4180`: by curl, a user signs in and reads /v1/me; a staff owner (STAFF_BOOTSTRAP_OWNER_EMAIL) signs in,
invites a member and reads the audit log; each token is refused on the other side; then down.
Do not push; remove your worktree and databases. Hand back in 12 lines: head sha; every ruling id (S, T, U, V) closed or not with its
test's name; any HALT with its two sources; counts (resources, endpoints, tests); what did not run against a real provider; EXIT lines.
