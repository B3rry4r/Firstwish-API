BUILDER API-BASE-2 | TIER T2 money | Budget 110 steps. Three named items; change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, build/sweeps/api.md (the section "For the next API base"), rulings HG1,
HF1, HF2, HD2, ZB3 in build/rulings-phase3.md, and how INT-7 reopened the registry (build/prompts/INT-7.md; tools/pipeline/
reconcile.py --reopen, freeze.py, gen_schema.py, show.py; scripts/check-contracts.mjs).
Work: /home/user/Firstwish-API, local branch `api-base-2` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-2 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab2. Never commit on
claude/sleepy-mayer-f0hkb8 itself. Do not edit a gate, a baseline or a test you did not write (say so and HALT if one must change).
Cases:
 1. HG1 (ruled; the registry reopens for this one field): the Concierge give route's body gains the maker the staff member
    saw (the expected maker; name it as the registry's naming rules give). A give whose expected maker is not the order's
    maker now is 409 order_changed and NOTHING changes (no wish moved, no audit row of a give, no email). The field is
    required (a give without it is 422 with the field named). Registry: reopen, add the field, freeze as the next DEC,
    regenerate the contracts; check-contracts and check-routes stay green. Tests through the real route: the right maker
    gives; a stale maker is 409 and the order, the wish and the audit are as before; two staff giving at once with the
    same expected maker: exactly one 200.
 2. draw-giveback.ts (near line 44): a client-wish record drawn from a pack gives its wish back to a pack ONLY when the
    business holds a standing pack grant it can be traced to; a record with drawFrom "pack" and no payment recorded
    returns nothing (marked given back with nothing returned). Test with a hand-built record: the refunded pack stays 0.
 3. royalties/draw-source.ts (near line 70): each pack's standing draws are counted separately, so after a wish of the
    first pack is given back the next draw is sourced to the FIRST pack until it is full, and no pack is ever named for
    more wishes than it sold. Test: two packs of 5, one draw of the first given back, then draws until both are used:
    each pack is named for exactly 5 standing draws, each draw has its drawPaymentId, the creator shares follow HD2.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, scripts/gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `npm test -- --maxWorkers=2` once (name any failing test). Commit on api-base-2; do
not push; remove your worktree and databases. Hand back in 10 lines of claims (one per line, each testable): the head, the
new DEC id and the field's name, each case closed or not with file:line and the test's name, what was NOT RUN.
