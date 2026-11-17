VERIFIER API-BASE-9 | TIER T2 money and identity, full | Budget 120 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: run ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs, and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab9/NOTES.md as you go (a restart must not lose them).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-9.md (its 9 cases are the contract), rulings IA1, IA4, IB1-IB6,
HZ2, HU5, HU6, ZB3, EB1, HF1, HJ1 in build/rulings-phase3.md, and the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/api-base-9-claims.txt.
Under test: /home/user/Firstwish-API, local branch `api-base-9` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab9 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab9. Run every command with
your own worktree as the working directory. Probes as specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab9/ (not in the repo). Remove
your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). In this order:
 - The passcode (IA4, identity): for a reveal sent WITH a passcode, enumerate every route that returns, makes,
   copies or re-sends a link or a code for that shoot, reveal, client wish or its files (business routes, the
   client's link, the new one-call reveal with `again`, the downloads route, the favourites routes, staff reads):
   none gives the photos, the file addresses, the favourites or a download without the passcode's proof. The
   builder says it gated "the links the business copies, not other clients' reveals": say exactly what that leaves.
 - The one-call reveal (IA1, money): 30 identical calls at once with a key, and 30 with NO key and the same body;
   the same from two logins; a refused email, an empty pack, a lapsed plan (nothing taken, nothing sent); a retry
   after the answer was lost; `again`: one wish in all, a second email, the same link or a new one (which, and is
   the old one still good?); mixed old and new calls for the same shoot and client (the two older calls then the
   new, and the reverse): one wish from the pack in every order. The pack counter, the client wishes, the
   reveals and the outbox after each.
 - Favourites and downloads at the public link (IB1, IB2): before the passcode nothing; marks by POSITION: what
   happens to marks when the business removes or reorders a file (a heart must not move to another photo); the
   limits (61st in an hour, 201st per link) in words; a proof is never downloadable by any address or id trick;
   downloads off: no address; the signed read's lifetime; the business cannot write a mark.
 - Who (IB3, IB6, HU5): rename and upload tickets by the owner, a live login, a removed login, another business;
   a rename with a path, 500 characters, markup: stored and returned safely; the stored object name unchanged.
 - Subsets and plays (IB4, IB5): a file of another shoot, a removed file, a file not ready: 422 in words; the
   first play sets openedAt once (30 plays at once: one openedAt, the count 30); a play before the passcode
   counts nothing.
 - Concierge make-the-wish (HZ2, T-12, identity and money): can a maker really finish a wish end to end with what
   the server has: the buyer's photos (the builder says a maker CANNOT upload for the buyer and add-photos takes
   only files the buyer already owns: where would a Concierge buyer's photos come from? read how an order is
   placed and what it carries), the words, the style, a seal (paid by the order: no payment row? a Signature
   ticket: read the ledger and the pack and ticket rows), delivery? If a maker cannot produce a complete wish, say
   exactly which step is missing (that is HIGH: the service is sold). Then: the buyer cannot see, list, open,
   count or be emailed about the wish before delivery (every list and read of theirs, the feed, the dates);
   another maker, the same maker after the order moves, the maker on the buyer's OTHER wishes: 404 on read and
   write; cancel, refund and the buyer's erase with a wish half made: the wish and its files go; a second
   make-the-wish on one order (how many may an order have: the order's quantity?).
 - The suite: settle-lock-order.spec.ts failed once under load with a pool timeout: run it five times beside two
   other money specs with --maxWorkers=2: does it fail, and is the timeout a real limit a busy production could
   hit (the settle path holding a transaction while waiting on locks) or only the test pool's size?
 - gates.sh, check-contracts, check-drift, check-routes EXIT 0; `WEB_LIB=/nonexistent/lib npm test` twice, 0 failed.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run.
