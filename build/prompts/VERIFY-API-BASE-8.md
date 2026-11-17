VERIFIER API-BASE-8 | TIER T2 money and identity, full | Budget 110 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-8.md (its 5 cases are the contract), rulings HY1-HY5, HR1, HU6 in
build/rulings-phase3.md, and the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/api-base-8-claims.txt.
Under test: /home/user/Firstwish-API, local branch `api-base-8` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab8 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab8. Run every command with
your own worktree as the working directory; one jest run at a time (two browser stacks share the machine). Probes
as specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab8/ (not in the repo). Remove your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). In this order:
 - The drop (HY1, money): drop then the provider reports paid (HU6: nothing else paid since = fulfilled once; the
   owner paid another plan since = refund due and said so on the read); drop and settle at the same moment, 30
   pairs, five times; drop by a login, by a removed login, by another business's owner, by staff; a drop of a
   pack or Vault payment (must be refused: plans only); after a drop the 409 on a new start is gone at once; the
   ledger and invoices after every path (no invoice for a dropped payment; one for a late paid one that is kept).
   The builder CHANGED paidSince to look at the business: does that change any older path (a login pays, the owner
   pays, both settle: who is refunded; a pack paid between two plan payments)?
 - Reading a payment by reference: the owner and a live login read the business's PLAN payments; do they now also
   read each other's NON-plan payments (packs, Vault, a login's personal ticket payment)? Anything beyond the
   business's own plan, pack and Vault payments is a leak (HIGH).
 - The maker's wishes read (HY5, privacy): the builder says no wish is linked to an order before delivery, so the
   read lists ALL the buyer's made wishes no order has delivered. Establish how a Concierge wish comes to exist
   (who makes it, in whose account) and say exactly what a maker can now learn about a buyer's OTHER wishes (ids,
   numbers, receivers' first names of wishes the buyer made alone). If a maker sees a wish that is not this
   order's work, that is HIGH: name the smallest server change that would tie a wish to its order.
 - Search (HY2): a moderator or support member with masked contacts: search by a full email, a partial email, a
   phone, a name: what comes back and what an attacker learns from the COUNT alone (try every prefix); injection
   strings and a 500-character word; paging stays stable while rows are added.
 - The hand-over list (HY3) and the Concierge payment fields (HY4): each staff role and a maker, by direct call.
 - The suite's health: the builder moved its new specs to a fixed far date because two OLDER specs failed beside
   them. Run `npm test` (CI's command, default workers) three times: 0 failed each? Then run those two older specs
   beside the new ones with the new ones on today's date (a local edit you do not commit): which older assertion
   breaks and is it a real order dependence in the older spec (then say the one-line fix)?
 - The contract edited by hand: read E-269, E-270, E-271 and the changed reads in the registry against what the
   routes return (three by hand); check-contracts, check-drift, check-routes, gates.sh EXIT 0.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run.
