VERIFIER P-B16b | TIER T2 money | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B16B.md (its three points are the contract), rulings ZZ5, ZZ4, ZZ6,
GB1, ZB3 in build/rulings-phase3.md, and T-66, T-67 in .pipeline/product-truths.json.
Under test: local branch `p-b16b` (head ebe4a2b) against `p-b17b` (ef2b4ae): the diff of the two is all you check. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb16b (detached at p-b16b; `npm ci`); ports 5010-5019; TEST_DB_PREFIX=vpb16b; a clock in 2201 (your own
months, so no other spec's invoices or settlement days meet yours); remove both when done; kill by PID.
Known and NOT findings (GB1): a client wish made from the sheet (E-30) or a date (E-32) and sealed by the ordinary seal earns
nothing yet; a banned creator still earns and the payout waits.
Check, each PASS or FAIL with what you saw (work EVERY figure and ledger by hand first from the seeded price book; after every
case every journal sums to zero and the creator's summary equals the ledger):
 - Figures through the real routes (a business pays for a plan or a pack with the stand-in provider, then seals with
   usePlan in a creator's Premium style): Starter at list and at 40% off, Studio, a pack, a rolled-over wish (which month's
   payment it uses), a template style (the two shares sum to the royalty, no kobo made or lost), a plan whose price changed
   in the price book after it was paid (the accrual uses what was paid).
 - Which payment: two packs bought at different prices (a promotion between them) and wishes drawn across both: each wish
   earns from its own pack, oldest first; a plan renewed mid-month; a wish drawn after the plan lapsed from a pack.
 - Twice: 30 seals at once for one creator and for three creators; a replay of a seal; the same wish cannot earn twice by
   any route; nothing for Standard, Starter, house styles.
 - Refunds: the plan payment refunded after 0, 3 and 10 wishes were drawn; a pack refunded with wishes used from it and from
   another pack; after a payout (negative balance, next run pays less); a refund racing a seal (20 tries: never an accrual
   left standing for a refunded payment, never a reversal with no accrual, no deadlock); the refund's own ledger reversal
   does not take the royalty back a second time.
 - The diff outside royalties (business-handlers revoke now records `drawn`; pro-business module): the business's counts
   (used, left, pack) are unchanged by this patch in every case of the P-B17b spec (run it).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules/royalties
src/modules/payouts src/modules/purchases src/modules/pro-business src/modules/refunds` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b16b/VERDICT.md (30 lines or fewer). Hand back in 15 lines or fewer: merge or fix; findings by severity with file:line.
