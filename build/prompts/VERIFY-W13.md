VERIFIER W13 | TIER T2 full, measured in a browser on a real API stack | Budget 110 steps. Machine: 4 CPUs, 15 GB; a heavy
job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W13.md.
Under test: /home/user/Firstwish-web local branch `w13-staff3` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w13-staff3 (web)
and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w13-staff3-api (API); stack prefix vw13; ports 5420-5439; verify folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w13-staff3/ (pictures in shots/). Staff on the stack: as scripts/live/flows/w11.mjs and w13.mjs do.
Besides the common list, attack:
 - Privacy: a staff wish read and a staff person read NEVER carry the maker's private note, a passcode, a sign-in code,
   a token or an unmasked contact before a reveal (read the network answers, not only the screen); a reveal needs a
   reason, is in the audit with who and why, and shows only to that staff session; a role that may not reveal has no
   control and gets 403 by direct call.
 - Roles: each staff role the contract has x each write and read here: a table role x action -> status and what was
   drawn; the builder kept its own role table (W13_ACTIONS in lib/admin/w13-api.ts or nearby): compare it cell by cell
   with what the API enforces and name every mismatch (a control drawn that the server refuses, or hidden that it allows).
 - Wishes: take down, restore, extend and the rest: reasons required where the server wants them; two staff acting on
   one wish at once; a wish number that does not exist; a removed, an erased and a sealed wish: the server's words.
 - People: ban by each scope, lift, erase (owner only; the waiting period and words; what the person then sees on
   sign-in on the same stack); an erased person: every action refused with the server's words; search with a name of
   one letter, an email fragment, SQL-looking text.
 - Creators and payouts: "Mark paid" on a creator with no due payout, a wrong month, twice fast, as a role that may not;
   the row in the database after each; the money shown equals the API's kobo.
 - Moderation: two moderators on one item (the second sees the server's words); allow and refuse write the verdict
   the API reads back; an item whose wish was removed meanwhile.
 - Now Showing: approve, pick the wish of the day, unlist: what GET /v1/showing gives a signed-out visitor equals the
   screen after each act; picking a day 7 days ahead (the limit is 6): the server's words.
 - The old seam: the builder deleted fixtures and seam code from lib/admin-api.ts and lib/admin/b-api.ts: build and
   open EVERY other admin screen (the W12 and W14 ones still on fixtures, and W11's six) and report console errors or
   broken pages; no screen of this bundle imports a fixture.
 - The builder's named gaps (judge each: is the screen honest about it, or does it show something untrue?): people
   search has no wish-number search; a held photo is not drawn (only a file id comes); days 1 to 6 of the wish of the
   day are not shown after a reload (only picks made in this visit: is a pick made earlier invisible, and can staff
   then pick twice?); no order control; "Mark paid" asks for a month typed as YYYY-MM.
