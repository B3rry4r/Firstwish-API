VERIFIER P-W6 (re-check of a patch) | TIER T2 full with the money attacks (this is where a customer pays) | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w6-maker3/round2/NOTES.md (if it exists an earlier verifier was lost: read it and carry on). Stop only
PIDs you started.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md, the patch brief build/prompts/P-W6.md (F1-F3), rulings ID1-ID3, HR2, HU6 in
build/rulings-phase3.md, and the first check's files /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w6-maker3/VERDICT.md and NOTES.md.
Under test: /home/user/Firstwish-web local branch `w6-maker3` (head in your spawn line; it now holds the web work head merged in).
Your OWN detached worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w6b (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w6b-api (API at the commit in your spawn
line); stack prefix vw6b; ports 5580-5599; the stack BUILT (`npm run live:up -- --built`, never next dev); the
driver as `node scripts/live/drive.mjs` on a FRESH stack. Run every command with your own worktree as the working
directory.
Re-check, counting on the server after each (payments by state, tickets, the wish's line and state, the ledger):
 F1 (was HIGH: one person charged twice for one wish): Moment in one browser and Keepsake in another at once (five
    rounds); one browser: leave Moment unpaid, then try Keepsake; "Continue that payment" (the same reference, one
    payment); "Start again" (asks first; the server's drop; then another ticket pays); a late "paid" for the
    dropped one (refund due in the server's words, the wish unchanged); the waiting payment running out by itself
    (60 minutes by the server's clock: restart your stack with STANDIN_CLOCK_OFFSET or say why not): what does the
    ticket step show and can the person pay again; a reload and back on every one of these states; two tabs.
    Nobody is charged twice with one ticket and nothing said; nobody is stuck unable to pay.
 F2 (ID2): a ticket payment's return (the provider's return through /app/wishes/return, "Read the result", and
    another browser) lands in the maker at the ticket step with the paid ticket and "Seal it", or on Sealed; a
    draft with a paid ticket says "Your ticket is paid. Seal it to send." on Home, in Wishes and on its page; an
    unpaid draft still says the old line.
 F3 (ID3): paid in one browser and sealed in another, then "Read the result" in the first: Sealed; the maker
    opened on a sealed wish at every step address shows Sealed and changes nothing on the server.
 Also, because the branch merged the head: the first check's passes still hold (sample: a Pass seal with no
 payment; a business draft on a plan; a refused seal keeps the paid ticket; prices on the ticket step equal the
 price book and what the start charges); the builder touched components/app/feed/Home.tsx outside its file list:
 Home's other lines unchanged; the four screens at 360 and 1440, light and dark: no sideways scroll, 0 console
 errors, storage empty (R10).
 Then: w6-maker3.mjs alone 0 FAIL; the whole driver on a fresh stack: the ONLY allowed FAIL is "W12 the owner's
 payout change clears PROVISIONAL" (known: the tenth API round's new provisional setting; being fixed elsewhere);
 typecheck, gates, test:client EXIT 0.
Hand back ONCE in at most 15 lines: verdict (merge / fix first), each F with PASS or FAIL and file:line, new findings
by severity, what was not run. Remove YOUR worktrees, stack and databases; leave no background jobs.
