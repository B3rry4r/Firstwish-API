VERIFIER API-BASE-20 | TIER T2 (what a wish holds; a possible second charge), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-20/NOTES.md (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/API-BASE-20.md (its cases are the contract), rulings IJ2, IJ3, IJ3a, IJ4, IJ4a, IJ4b, IK3a,
IK4, IK4a in /home/user/Firstwish-API/build/rulings-phase3.md, and truths T-02 to T-08, T-29, T-30 in /home/user/Firstwish-API/.pipeline/product-truths.json. The builder WROTE rulings IL1 to
IL4 itself on its branch (the end of build/rulings-phase3.md there): read them as its claims, not as settled.
Under test: /home/user/Firstwish-API local branch `api-base-20` (head 285a325) against its base 0aba805. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab20 (`npm ci`, `npx prisma generate`); ports 5210-5219; TEST_DB_PREFIX=vab20. The lead's long live test
runs on ports 5400/5401 (prefix leadrun; worktree build/wt/lead-drive-api): never touch it. Probes as specs under the verify folder, through the real routes.
The builder's claims: (1) the head already refused every held extra (6 extras x 4 tickets x draft and sealed); twenty
starts at once: one 201, nineteen 409; five more photos stays buyable again and again (T-30); an extra the ticket
includes now answers extra_in_ticket words; the 15-second clip is held once "because the server counts no clips".
(2) the owner's single and list reads carry `adds` (sku, from ticket or purchase, held, a refund's state, reference);
one query a page for the list; the public link's read does not carry it. (3) GET /v1/ticket-offers?wish=<own> answers
any signed-in person with all four tickets (canBuy, reason, words, priceKobo, listKobo), the words equal to the
payment start's; another's or an erased wish 404. (4) a kind or occasion move that sends no style picks one (204 of
204 cells save; the held style kept where still offered). One registry reopen DEC-318 to 322. Two older specs changed
(ab15r1-ij4-kind-style, ab17-ij4a-occasion-style: they now name the style to keep the refusal check). Full run 1643 passed.
Attack (each PASS or FAIL with what you saw; a second charge or a paid thing lost is a BLOCKER):
 - Second charge: every extra the book sells, for a wish that holds it through its ticket, a purchase, a Pass, a
   business plan, a Concierge order, a gift: the start, twenty at once, a start while another payment for it is
   pending, after that pending one fails, after a refund sent and after it is done (may it be bought again then?).
   Five more photos: how many times; does the wish's photo limit really rise by five each time and the upload obey
   it? Clips ("the server counts no clips"): does the SERVER enforce Premiere's three clips of 15 seconds and the
   extras' one more clip and the 60-second clip at upload or seal, or only the web? If not enforced: a finding
   (which truth, where it should be), not a fix.
 - `adds`: its truth against the payments and grants tables in each state above (bought, pending, failed, refunded,
   included by ticket, a ticket upgraded so the extra becomes included: what happens to the money paid for it?);
   another account, staff, the business's view of a client's wish, the public link, an erased wish: who sees it;
   the list at 50 wishes: count the queries.
 - Ticket offers: the read against the start for every ticket x a wish in every state (draft, sealed, showing,
   resting, erased, with a style above the ticket's level, with too many photos, no renderer): do `canBuy` and the
   words ALWAYS match what the start then does (try the start after each read)? prices against the price book and
   the dated price (T-26); another person's wish id; no session.
 - Moves: the 204 cells again with a ticket held and a creator's style held; a move on a SEALED wish; a move that
   lands on a style above the wish's paid level (never: IJ2); the pick is the same as a new draft's for that cell;
   the two older specs still prove the refusal they proved before (read both diffs: was anything loosened?).
 - The contract: additive only; check-contracts, check-drift, check-routes; no new migration, or a named one.
Then typecheck, the WHOLE lint, scripts/gates.sh, and `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once (if
your session refuses that command, do not retry and ask nobody to run it: say NOT RUN).
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-20/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by
severity with file:line; and say for each of IL1 to IL4 whether the code does what the ruling says. Drop your
databases, remove your worktree. Hand back ONCE in 15 lines.
