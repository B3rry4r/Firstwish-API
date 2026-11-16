BUILDER P-PACK-REFUND | TIER T2 money | Budget 85 steps. Two rulings (HJ1, HK1); change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HJ1, HK1, TT5, ZZ5, HF1, HF2, HH2 in build/rulings-phase3.md, the verifier's
file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab2/VERDICT.md and its probe specs beside it (reproduce its finding FIRST, as a failing test).
Work: /home/user/Firstwish-API, local branch `p-pack-refund` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-pack-refund (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ppr. Never commit on claude/sleepy-mayer-f0hkb8
itself. Do not edit a gate or a baseline; an older test changes only if HJ1 itself makes its expectation wrong (name
each such line and why; HALT if unsure).
Cases (through the real routes and the stand-in payments, packs built by payment):
 1. src/modules/purchases/business-handlers.ts revoke() (near line 249), wish-pack: off the counter comes the refunded
    pack's own unused places (its size less the standing draws sourced to it by drawPaymentId, counted the way
    royalties/draw-source.ts counts them: one function, not a second copy), never below 0; its `drawn` is its own
    standing draws. Pack A full, pack B with 2 drawn, refund A: the counter stays 3, A's drawn is 5, B's next 3 draws
    work and the 4th is 402.
 2. Refund B instead (2 drawn): the counter drops by 3; A's wishes are untouched. Refund both in either order: 0, never
    below. A refund racing 20 draws and 20 give-backs: the counter always equals the sum over standing packs of (size -
    standing draws), checked after every step against a by-hand function over 200 random orders (2 and 3 packs).
 3. A wish given back AFTER its pack was refunded returns nothing (HF1 holds); a wish given back to a standing pack
    while another pack is refunded returns to its own pack.
 4. The plan side of revoke() and packEnds are unchanged (run their specs).
 5. HK1: the stand-in email adapter (find it under src/common/ports; never the real adapter) appends each message as one
    JSON line (to, template, subject, text, at) to the file named by STANDIN_MAIL_OUTBOX when set; unset: nothing is
    written. The app refuses to start (a clear config error) when it is set and the email provider is the real one or
    NODE_ENV is production. No route. Tests: a sign-in code asked through POST the real route appears in the file and
    signs in; unset writes no file; the two refusals. Add the variable to .env.example and .pipeline/env-manifest.json.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-drift, check-routes,
`npm test -- --maxWorkers=2` twice (name any failing test). Commit on p-pack-refund; do not push; remove your worktree
and databases. Hand back in 8 lines of claims (one per line, each testable), any older test line changed and why, NOT RUN.
