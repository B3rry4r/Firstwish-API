PATCH P-B17b | TIER T2 (the plan's wishes; erase) | Budget 110 steps. Build ruling ZB3 on the new shared base. Nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, rulings ZB3, RR3, RR4, GG2, GG5, OO1, RR2 in
build/rulings-phase3.md, and in /home/user/Firstwish-web: components/app/make/Maker.tsx (search sealOnPlan), lib/pro-api.ts, lib/pro-data.ts
(addWish, usage), app/app/pro/wishes/page.tsx, app/w/mine/page.tsx (R5: the app is the truth for what a business does).
Base: local branch `int-5` (the head in your spawn line): ClientWish.wishId and the seal body's `usePlan` exist there.
Work: local branch `p-b17b` from it; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-b17b (`npm ci`); ports 4950-4959; TEST_DB_PREFIX=pb17b. You may touch
src/modules/pro-business, src/modules/wishes, src/modules/purchases (the business draw only), src/modules/accounts (the erase
only), src/modules/public-wishes (the erased-owner rule only) and their tests. Branch rr4-attempt (02cca9e) is a rejected
attempt: read its erase spec for ideas, do not merge it.
 1. Making a client wish with no reveal (E-30, and E-32 approving a date) also makes a wish: a draft owned by the caller,
    carrying the business (wish.businessId), with a Signature ticket given by the SAME draw in the SAME transaction
    (BusinessHandlers.draw then WishesService.fulfilTicketIn), sharing the client wish's number; ClientWish.wishId points to
    it. The answer carries the wish id so the screen can open the maker on it. A client wish WITH a reveal makes no wish
    (it plays at the reveal link).
 2. The maker's path: sealing a draft with `usePlan: true` by a business owner or a live login draws one wish (month, then
    pack; none left: 402 as E-30), writes the client-wish record (client = the wish's name, kind, occasion, day) linked by
    wishId, gives the Signature ticket and seals, all in the seal's transaction. A person with no business: 403. A wish that
    already has a ticket: 409 (it is not drawn twice). usePlan and usePass together: 422.
 3. Only these two ways set wish.businessId. A business owner's ordinary wish (paid by ticket or Pass) never carries it; the
    body cannot set it (422 stays).
 4. sent, opened and ends on the client wish are read from its wish (one truth); the list and detail show them.
 5. RR3 for real rows: erasing the owner: client wishes already sealed keep playing at their links to the end of the term
    and are then erased (wish, files, link, the client-wish row's words); drafts are erased at once; a login's client wishes
    for that business are covered too (they carry the business); a person's own wishes are erased at once as before.
 Tests through the real routes with no row set by hand: 20 at once with 3 left for each path (exactly 3; no wish without a
 draw, no draw without a wish); a failed step after the draw gives the wish back; the erase cases of 5 (move the clock; run
 the due jobs with `only`); another business and a removed login see nothing; a refund of the plan payment that paid for a
 sealed client wish: say what the existing revoke does and do not change it.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, `npm run test:affected --
src/modules/pro-business src/modules/wishes src/modules/purchases src/modules/accounts src/modules/public-wishes
src/modules/vault` twice. Commit on p-b17b; do not push; remove your worktree and databases. Hand back in 12 lines of claims
plus any HALT.
