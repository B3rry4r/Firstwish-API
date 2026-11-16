VERIFIER W12 | TIER T2 full with the money attacks, measured in a browser on a real API stack | Budget 110 steps.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W12.md;
rulings TT3, UU1, HJ1, X18, R14, FA1, HD4 in /home/user/Firstwish-API/build/rulings.md and rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `w12-staff2` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w12-staff2 (web)
and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w12-staff2-api (API); stack prefix vw12; ports 5360-5379; verify folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w12-staff2/ (pictures in shots/). Staff on the stack: as scripts/live/flows/w11.mjs and w12.mjs do.
Besides the common list, attack:
 - Refunds, the money rule (TT3): a finance member starts a refund and tries to send it (refused, the server's words,
   nothing sent to the provider); a second finance sends; the owner starts and sends alone; ops, support, moderator,
   reviewer, maker: no control and 403 by direct call; send twice fast, send in two tabs, send while another staff sends:
   exactly ONE provider refund row and one ledger effect each time (read the stand-in provider's calls and the ledger);
   a refund of more than was paid, of a payment already refunded, of a pack with wishes used (HJ1: what the screen says
   was taken back equals the server's row); a refund left claimed (move its claim time in the stack's database) can be
   sent again and still makes one provider refund. After every act the screen's state equals the server's row.
 - The ledger and a payment's detail: five figures compared with the API's answers, kobo exact (an amount ending in
   50 kobo); search by reference, wish number and payer's email; the settlement day and "Check this day now": what it
   calls and what the screen shows for each server answer (404, not over yet, a mismatch).
 - Prices: a change makes a new book version on the server (read both versions); what the public price read
   (/v1/price-book or as the contract names it) then gives equals the screen; two staff changing at once (the builder
   says both get 200 as separate versions: is the second built on the first's values or does it silently undo them?
   A lost update on prices is HIGH); a price of 0, a negative, a non-number, a huge number: the server's words on the
   field; VAT shown only on the lines the server marks; the payout threshold marked PROVISIONAL (R14) until changed by
   the owner; a role that may read but not change sees no control and gets 403 by direct call.
 - Businesses: list and detail equal the API (plan, pack left, logins, client wishes, invoices; VAT lines only where
   the server gives VAT); no action is drawn that the contract lacks; another section's role by direct link.
 - The builder's named gaps, judge each (is the screen honest, or does it show something untrue?): the payout DAY is
   shown but cannot be changed (R14 asks for both: an API gap); who and when of a price change is read from the audit
   log (owner and ops only: what does finance see?); payments state filter and business search work only among loaded
   rows (does the screen say so, or does a search for an older payment wrongly say "none"?).
 - The old seam: lib/admin/c-api.ts, c-fixtures.ts, c-types.ts now hold only Concierge (W14's): build and open the
   Concierge screen and the other fixture-backed admin screens and report console errors; no W12 screen imports a fixture.
 - The builder wrote into the main web clone by mistake once and restored it: confirm /home/user/Firstwish-web's working tree
   is clean of anything from this branch (git status there; do not change it).
