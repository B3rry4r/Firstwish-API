VERIFIER P-API-BASE-8 re-check | TIER T2 short | Budget 50 steps. You did not build this. Only the patch's F1-F5 and what it could break. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, the patch brief build/prompts/P-API-BASE-8.md and rulings HZ1-HZ4, HU6, HR1 in
build/rulings-phase3.md. Under test: /home/user/Firstwish-API local branch `api-base-8` (head in your spawn line; the first check's head was
9649ee5). Your own detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-ab8 (`npm ci`, prisma generate); ports 5210-5219;
TEST_DB_PREFIX=v2ab8; one jest run at a time (two browser stacks share the machine). Run every command with your
own worktree as the working directory. The first verifier's probes are in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab8/: copy them to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab8/round2/ and run the ones for the two HIGH findings and the double-plan path on this head FIRST:
each must now pass; say each one's result.
Then attack:
 - F1 (search): for a support member and a moderator with masked contacts, on BOTH lists: %, _, \, %% , a prefix
   with each, an escaped form (\%), mixed case, a trailing space, a Unicode look-alike of @, a wish number with
   one digit replaced by _: no hit and no difference in the count or the page size from a plain miss; the exact
   address and the exact wish number still hit and return the mask. Timing: 200 hits and 200 misses: is the
   difference in response time large enough to tell them apart (say the two medians)?
 - F2 (the maker): before delivery the list is empty for a solo buyer and a business buyer; after delivery only that
   order's wishes; a second maker on the buyer's second order sees nothing of the first; by direct call with
   another order's id: 404.
 - F3 (money): drop A, start B: A then B settle; B then A; both at the same moment (30 pairs, five times); A lapsed
   instead of dropped; then the ordinary paths the fix must not break: pay, wait until fulfilled, pay again (adds a
   month, no refund flag); a plan change up and down; a pack bought between two plan payments; the owner and a
   login each paying. After each: one plan applied per intent, invoices equal fulfilled payments, the ledger
   balanced, the refund-due one says so on its read.
 - F4: a plan start naming the pack is 422 with words; a pack bought the pack's own way still works.
 - F5 (the suite): the builder changed older specs (pro-business.spec.ts's invoice asserts now count by number
   across all months; its attacks set checked payments to "refunded"; zb3 makes its own style): is any assertion
   weaker than before (read the diff of each)? Is the "refunded" change in TESTS only (grep src for it)?
   `WEB_LIB=/nonexistent/lib npm test` three times: 0 failed each.
 - gates.sh, check-contracts, check-drift, check-routes EXIT 0.
Hand back ONCE in at most 14 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove your worktree and databases; leave no background jobs.
