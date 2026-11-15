VERIFIER P-B04 | TIER T2, re-check by ruling id | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B04.md (what the patch had to close), the rulings it names in
build/rulings-phase3.md, and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b04/VERDICT.md (round 1's findings).
Under test: local branch `p-b04` (head 4baaeb7) of /home/user/Firstwish-API; its base is local branch int-2 (51fb61e). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b04 (detached at the branch; `npm ci`); ports 4380-4389; database prefix vpb04; remove both when done; kill by PID.
Run the stack (`scripts/stack.sh up vpb04 4380`, seed it) and prove each ruling with your OWN requests and scripts (real HTTP where
a route exists, createTestApp otherwise; never the builder's spec as the proof). For EACH id say CLOSED or OPEN with what you saw:
 X13 (GET /v1/ticket-offers?ticket=..&extras=..&extras=.. answers ONE quote: lines in kobo, a total that is their exact sum, the
 version used; a price or amount in the query is refused; an unknown line 422), X14 (the public book's shape), X15 (value by
 kind), X16 (ops reads, cannot change; owner and finance change; every other role refused), X17 (the end moves sooner only),
 X19 (an owner's change clears PROVISIONAL; finance's does not), Z1 (a draft dated ahead is 422; a change shows in the public book
 at once), Z2 (no concierge.rush anywhere), Z3 (the same price again is 409 with no new version and no audit row, also when sent
 10 times at once), Z4 (changing list leaves price-now alone and the other way round).
Money again, after the patch: every seeded price, list price, term and limit still equals the web app's files (the round-1 table: 24
lines now); quote() for 1, 2, 3 and 7 of each line and a mixed basket is the exact integer sum; 20 price changes at once give 20
versions in order with 20 audit rows; at the promotion's end (clock port) the public book and quote() agree.
Also: every round-1 finding of this bundle is closed; nothing that passed in round 1 broke (re-run 5 of its attacks); the diff
touches only this bundle's modules (`git diff --stat int-2...p-b04`); anything NEW that is high or blocker.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b04/VERDICT-P.md (30 lines or fewer). Hand back in 12 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what you did not run.
