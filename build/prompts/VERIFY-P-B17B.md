VERIFIER P-B17b | TIER T2 (the plan's wishes; erase) | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B17B.md (its five points are the contract), rulings ZB3, ZB4, RR3,
GG5, OO1, RR2 in build/rulings-phase3.md, and /home/user/Firstwish-web/components/app/make/Maker.tsx (sealOnPlan).
Under test: local branch `p-b17b` (head ef2b4ae) against `int-5` (e1b1999): the diff of the two is all you check. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb17b (detached at p-b17b; `npm ci`); ports 4980-4989; TEST_DB_PREFIX=vpb17b; a clock in 2200; remove both
when done; kill by PID.
Known and NOT findings: a login who erases their own account loses the business client wishes they made at once (ZB4, join);
wishId is on the wire but not in the contract type; a refund of the plan payment does not unseal wishes; the Vault spec can
get 429 when specs share an address.
Check, each PASS or FAIL with what you saw (count by hand first; rows only through the real routes):
 - The count is exact both ways: E-30, E-32 and the maker's seal with usePlan, 30 at once with 3 month + 2 pack left, mixed
   across the three routes: exactly 5 wishes made, 5 draws, 5 records, each record linked to one wish and each wish to one
   record; no wish with a Signature ticket and no draw; no draw with no wish; a forced failure at each step gives it back.
 - Free tickets: can anyone get a Signature ticket without a draw or a payment? Try: usePlan by a person with no business; by
   a removed login; by a login with the x-business-id of a business they are not in; on a wish that has a ticket; on
   another account's wish; usePlan twice on one wish (20 at once); usePlan after the plan lapsed with no pack; usePlan and
   usePass together; sealing a wish made by E-30 again with usePlan (it already drew once: must not draw twice); a wish made
   by E-30 then its ticket refunded or the plan refunded before the seal; deleting the draft made by E-30 (is the drawn wish
   given back or lost: say; lost for good with no way back is a MEDIUM).
 - businessId: set only by these paths; a body or a PATCH cannot set or clear it (422); a business owner's own ticket or Pass
   wish does not carry it; a wish cannot move to another business.
 - Who sees what: a login sees the business's client wishes and their wishes' state but not the owner's own wishes; another
   business sees nothing; a removed login loses the wishes they made for the business at once (403/404) and cannot seal a
   draft they made.
 - One truth: sent, opened and ends in the client-wish list equal the wish's own values through seal, open (POST /opens),
   rest and wake.
 - Erase (RR3) through real rows: the owner erased with a draft, a sealed unopened, a live and a resting client wish, some
   made by a login: right after, the owner's name and email and the client's name and contact are in no table (scan); the
   sealed and live ones still play at their links with photos; at each term's end they are erased with files and link and
   do not rest a year; a person's own wishes are erased at once as before; the erased owner's business takes no new wish.
 - Nothing else changed: the Pass paths (usePass, pass-upgrade) and a ticket seal behave as on int-5 (run their specs).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules/pro-business
src/modules/wishes src/modules/purchases src/modules/accounts src/modules/public-wishes` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b17b/VERDICT.md (30 lines or fewer). Hand back in 15 lines or fewer: merge or fix; findings by severity with file:line.
