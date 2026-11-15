VERIFIER B04 | TIER T2 full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B04.md (the cases are the contract),
.pipeline/conventions.md (money), owner rulings R5 and R14 in build/rulings.md.
Under test: local branch `b04-price-book` (head 99f2107) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 (f0be0ad). Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b04 (detached at the branch; `npm ci`); ports 4280-4289; database prefix vb04; remove both when done; kill by PID.
Endpoints: E-123..E-127, E-213 (`python3 tools/pipeline/show.py endpoint E-125`). Run the stack (`scripts/stack.sh up vb04 4280`, then
the seed) and test over real HTTP with your own scripts. Known and NOT findings (the builder halted; rulings X13-X19 in
build/rulings-phase3.md): E-213 has no ticket and extras query yet; the public book's extra fields; Price.value for a date line.
CLAIMS: each numbered line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b04/CLAIMS.md: PASS or FAIL with what you saw.
Attacks (this is where every charge in the product is decided):
 - The truth: compare EVERY seeded price, list price, term and limit with the web app's own files (/home/user/Firstwish-web/lib/catalog.ts,
   lib/account.ts, lib/pro-data.ts, lib/studio.ts, lib/maker.ts): a table of sku, app naira, server kobo; any difference is HIGH.
   Expected among them: tickets 3,000 / 6,000 / 12,000 / 21,000 now and 5,000 / 10,000 / 20,000 / 35,000 list; keeps 1,500 / 4,000 /
   6,000 never discounted; Pass 20,000 (35,000); Pro Starter 35,000 (58,000), Studio 105,000 (175,000), pack 17,500 (29,000);
   Concierge 15,000 (25,000); Vault 3,000 per 100 GB.
 - Rounding: is 40% off computed per line so that now = list * 0.6 exactly for every line, or by a stored now-price? For every line
   quote 1, 2, 3 and 7 of it and a mixed basket: the total is the sum, in integers; no float anywhere in the module (grep).
 - The clock: one second before and at the promotion's end, the public book and quote() agree with each other; a payment priced at
   version N keeps N's price after version N+1 is published; quote with a version that does not exist.
 - Staff: every role on every route against the registry; price 0, negative, 2^53, a decimal, a string, now above list (allowed?
   say), a reason of 3 characters; a change to a line that does not exist; two owners publishing drafts made from the same base at
   once; 20 parallel price changes: 20 versions in order, each differing by one line, 20 audit rows.
 - The public read: no staff field, no draft, no unpublished version; ETag changes on a publish; the cache header never outlives
   the promotion's end.
 - Entitlements: every sku has one; do the photo, clip, term and level numbers equal the web app's (list differences)?
 - Errors: the envelope; no 500 for a bad cursor, non-uuid id, huge body.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/price-book` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b04/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
