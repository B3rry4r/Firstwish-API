PATCH P-B16b | TIER T2 money | Budget 80 steps. Build ruling ZZ5 on the new shared base. Nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, rulings ZZ5, ZZ4, ZZ6, WW2, ZB3, T-66 and T-67 (in
.pipeline/product-truths.json) in build/rulings-phase3.md.
Base: local branch `int-5` (the head in your spawn line): the accrual's unique now includes the wish. Work: local branch
`p-b16b` from it; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-b16b (`npm ci`); ports 4960-4969; TEST_DB_PREFIX=pb16b. You may touch src/modules/royalties,
src/modules/purchases (the business draw and the plan and pack revoke only) and their tests.
 1. Export accrueForDraw(tx, {businessId, grant or payment the draw came from, wishId, styleSlug}) and say the one line the
    business draw must call; call it there, in the draw's transaction. A client wish drawn from a plan month or a pack earns
    the creator of its Premium style 20% of that wish's share of what the business paid: the plan payment's amount divided
    by the plan's wishes for the month it was drawn from (a rolled-over wish uses the month it came from), the pack payment
    by the pack's size; every share rounds down; a template style gives a quarter of it to the original creator (out of it).
    One accrual per wish and creator. Standard, Starter and house styles, an erased or banned-from-earning creator: nothing.
    The style is the one on the wish when it is sealed (a draft can still change style): accrue at the seal if the draw
    happens before the style is final, and say which you chose and why.
 2. A refund of the plan or pack payment takes back the accruals of the wishes drawn from it (reverse per wish, once), also
    after a payout (the balance goes below zero as ZZ6 has it).
 3. The ledger: balanced journals in integer kobo; the creator's summary equals the ledger.
 Tests, every figure by hand first: Starter at 40% off (T-66 says 70000 kobo a wish: prove it from the seeded price book),
 Studio (60000), a pack, a rolled-over wish, a template style; 20 draws at once for one creator; a refund after 3 of 10
 wishes were drawn; replay of the same draw.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, `npm run test:affected -- src/modules/royalties
src/modules/payouts src/modules/purchases src/modules/pro-business src/modules/refunds` twice. Commit on p-b16b; do not push;
remove your worktree and databases. Hand back in 10 lines of claims plus any HALT; what was NOT RUN against a real provider.
