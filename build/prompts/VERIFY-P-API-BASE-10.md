VERIFIER P-API-BASE-10 (re-check of a patch) | TIER T2 | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab10/round2/NOTES.md (if it exists an earlier verifier was lost: read it and carry on).
Read rulings IE1, IE2, IE3 in /home/user/Firstwish-API/build/rulings-phase3.md, the patch brief build/prompts/P-API-BASE-10.md (F1-F4) and the first
check's notes and probes in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab10/ (reuse the probes).
Under test: /home/user/Firstwish-API local branch `api-base-10` (head in your spawn line; the patch is the two commits on 44f3324). Your own
detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab10b (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab10b. Run every
command with your own worktree as the working directory. Remove your worktree and databases when done.
Re-check ONLY these, through the real routes (each PASS or FAIL with what you saw):
 F1 (IE1, was HIGH): a Concierge order of 1 and of 3 wishes: the buyer gives the most allowed (the builder says 15
    photos and 10 voices per wish, from the price book: read the book yourself); the maker puts ALL of it into the
    order's wishes, seals, delivers; one more file is refused in words. No ticket payment row, no grant, no extra
    ledger line; the ledger still balances and the order's payment is the only money. The hidden wish: the buyer
    gets 404, cannot pay for or upgrade it; another customer's ordinary unpaid wish is STILL on the Moment line
    (the change must not make every wish Signature). After delivery the buyer's wish reads Signature and the buyer
    cannot use it to get a free Signature for a different wish (edit it into a new wish? duplicate? reuse?).
    A premium style on a Concierge wish: allowed as on Signature.
 F2 (IE2, was MEDIUM): upper, mixed, padded and lower spellings of one wish id at every payment start (ticket,
    extra, keep, wake, concierge, the link's keep and wake): one waits, the rest 409 with the reference; a
    spelling that is NOT a UUID is refused, not lower-cased into something else; the drop route and the result
    read by an upper-case id; the webhook for a payment started in upper case settles the right wish.
 F3 (IE3): an unpaid order's files at day 29 and day 30 by the clock (rows and stored objects); a PAID order of
    the same age keeps its files; the setting is in the price book marked provisional and staff Prices can change
    it; a refunded order reads refunded (buyer read, staff read, the Numbers and Money reads still add up: a
    refunded order is not counted as income twice or as due), and its half-made wish and files are gone.
 F4: the buyer's erase: from that moment the maker and owner get nothing of the order's files (list, signed read,
    add); run the real job.
 Also: the migration on a database with orders in every state (made on 44f3324's parent state, then migrated);
 check-contracts, check-drift, check-routes, gates.sh, typecheck EXIT 0; the full suite ONCE
 (`WEB_LIB=/nonexistent/lib npm test`).
Hand back ONCE in at most 15 lines: verdict (merge / fix first), each F with PASS or FAIL and file:line, new findings by severity.
