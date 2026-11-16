VERIFIER API-BASE-2 | TIER T2 money, full | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-2.md (its three cases are the contract), build/prompts/
P-API-BASE-2.md, rulings HG1, HH1-HH3, HF1, HF2, HD2 in build/rulings-phase3.md, and the claims in your spawn line.
Under test: /home/user/Firstwish-API, local branch `api-base-2` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab2 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab2. Write your probes as
specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab2/ (not in the repo). Remove your worktree and databases when done.
Attack through the real routes (each PASS or FAIL with what you saw):
 - The give: 20 gives at once with the same expected maker: exactly one 200, the rest 409, one audit row, one notice; a
   give with the maker of ANOTHER order, a maker id that does not exist, null, a number, a missing field: 4xx with the
   field named, nothing changed; a stale give after a "give again": 409 and the order, wish, audit and email as before
   (read the rows); the first give of an order with no maker (empty string): works once; wrong role: 403.
 - The registry: DEC-212 and DEC-213 exist, only E-39 changed (diff the frozen registry against the base: list every
   difference), no id re-issued, check-contracts and check-routes green, the contracts file carries the field.
 - Pack give-back: no path (a route, a job, an erase, a refund in any order with the give-back, 20 at once) leaves a wish
   on a refunded or ended pack; a pack with a standing grant still gets its wish back (the INT-7 behaviour holds).
 - Two-pack sourcing: 200 random orders of draws, give-backs and one refund over two and three packs against a by-hand
   function: no pack is named for more standing draws than it sold; each draw has a drawPaymentId; shares follow HD2.
 - HH1-HH3: `git diff` of every test the patch touched: only the field added (HH1) and the pack built by payment (HH2); no
   expectation weakened (list any changed expect line); HH3: the seed diff matches what the patch said changed, and the
   served reference data equals the web head's files (run the web-files test with the web checkout present).
 - `npm test -- --maxWorkers=2` once: totals, name any failure; a failure also on the base is reported apart.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab2/VERDICT.md (30 lines or fewer). Hand back in 15 lines or fewer: merge or fix; findings by
severity (blocker, high, medium, low) with file:line; what you could not run.
