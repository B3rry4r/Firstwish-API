VERIFIER W14B | TIER T2 (staff identity, a payment link, masked contacts), full | Budget 80 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w14b/NOTES.md as you go (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, W14B.md (same folder: its cases are the contract) and rulings HY2-HY4, HZ1,
HZ2 in /home/user/Firstwish-API/build/rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `w14b-staff` (head 8c9e998) against its base 23d6542. Your own detached worktree
.../build/wt/v-w14b (`npm ci`) and an API worktree .../build/wt/v-w14b-api at the API commit in your spawn line;
ports 5500-5519; stack prefix vw14b; BUILT. Probes under the verify folder, not in the repo.
The builder's claims: Support "Find a thread" and Concierge "Find an order" send the word to the server's `q` with
the filters and paging, nothing filtered in the browser, masked contacts stay masked; "Hand to someone" reads the
short staff list and is drawn only where the session's `assign` action is present (owner and support, not ops), a
removed member is not offered and a hand-over to one removed meanwhile is refused; Concierge's "Payments and
refunds" opens THAT order's payment (/admin/payments?ref=<reference>) and is not drawn for a maker, an unpaid
order or one with no payment; the order shows the maker's list of its wishes (delivered or not); no chips above a
refusal; the Styles placeholder whole at 360; /admin/wishes at 390 no side scroll (cause: a long unbroken word in
"Nothing matches"); it CHANGED three assertions in scripts/live/flows/w14.mjs (outside its file map) and added a
"Reading the wishes" state; w14b 93 of 93, w14 121 of 121 alone; the whole driver was NOT rerun after its last
edits (before them: 1937 of 1942).
Attack as each staff role in a real browser at 360 first (each PASS or FAIL with what you saw):
 - What a search can reveal (a full contact shown to a role that sees it masked is HIGH): as owner, support, ops,
   finance, moderator, maker, reviewer: search by a full email, a part of one, a phone, a wish number, a name, a
   masked form copied from the screen: what each role sees in results, in the thread, in the address bar and in
   the page source; the search word with %, _, \, quotes, 300 characters, an emoji-free unicode name, a script
   tag: no error page, nothing run, the words say nothing matches; paging through 3 pages keeps the word and
   filters; back and forward keep them; nothing is filtered in the browser (count the requests).
 - Hand to someone: every role: is the control drawn only where the server allows (read the session's actions);
   by hand (the route) as a role that may not: refused in words; to a removed member, to oneself, to a role that
   may not hold a thread, two staff handing the same thread at once: one wins, the screen of the other says so.
 - The payment link: for each role that may and may not: drawn or not; opened by address by a maker and by
   support: what is seen; the link of order A never opens order B's payment (change the ref by hand: another
   order's, a personal payment's, garbage): the server's refusal in words; a refunded order's link.
 - The order's wishes list: only that order's wishes, delivered and not; a maker of ANOTHER order.
 - The three w14.mjs assertions the builder changed: read the diff: does each follow W14B's cases (a ruling or the
   server's actions), or was a check loosened? The "Reading the wishes" state: designed words, entered how?
 - Layout: /admin/support, a thread, /admin/concierge, an order, /admin/wishes, /admin/styles at 360, 390, 1440,
   light and dark, with a 300-character unbroken search word: no side scroll, no control outside its cell.
 - R10 storage empty; typecheck, gates (no new entry; baseline, wired.json, tsconfig.json equal the head's),
   test:client, check:css, contracts:check, build exit 0; w14b.mjs and w14.mjs alone once; the whole driver ONCE on
   a fresh stack to the END (over 3400 s; start the stack with
   STANDIN_SCREENING=hold:held,reject:refused,reject:bigpic:too-large): totals; a FAIL: rerun that flow alone twice.
Write VERDICT.md in the verify folder (40 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees, stack and databases; leave no jobs. Hand back ONCE in 20 lines or fewer.
