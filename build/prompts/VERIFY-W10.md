VERIFIER W10 | TIER T2 full with the money attacks, measured in a browser on a real API stack | Budget 120 steps.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W10.md;
rulings ZZ5, GB1, HD2, GC1, R10, R13, R14 in /home/user/Firstwish-API/build/rulings.md and rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `w10-studio` (head in your spawn line; base 7b5d6e6). Worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w10 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w10-api (API at the commit in your spawn line); stack prefix vw10; ports
5560-5579; verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w10-studio/ (pictures in shots/). Run every command with your own worktree as
the working directory. The builder's claims are its 7 numbered lines in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w10-studio-claims.txt: test, do
not trust; its own flow is scripts/live/flows/w10.mjs (run it, then attack past it).
Besides the common list, attack (money first):
 - Credits: buy a pack in two tabs, a double tap, back then pay again, a slow return, a reversed and a failed
   payment: credits on the screen equal the server's ledger after each; the price and the count equal the price
   book (kobo); an AI ask at 1 credit left in two tabs at once never goes below zero and never gives two answers
   for one credit; an ask that fails gives the credit back (or says the server's rule).
 - The document: two devices editing one draft (the stale 409 path: nothing typed is lost without the person being
   told; "Open the newer one" really opens it); 30 quick edits then a reload inside one second; the API killed for
   real for 60 s while typing (the builder only aborted a request): "Not saved yet" until the server answers, then
   saved once; a 2 MB document; the tab closed mid-save. Storage as the page sees it after every screen (R10).
 - Who: another creator's style id and published wish (read, save, submit, withdraw) = 404 from the screen and by
   direct call; a person with no creator side opening every Studio address; a closed creator side (the builder's
   REQUEST (a): does the switcher still show Creator after Close?); a handle another person holds, in two tabs.
 - Submit and review: double submit, edit while in review, sent back with a note (make it through the staff API,
   not SQL, if the staff route exists), approved (through the staff API): the style appears where the contract says
   with the creator's handle (the builder did not run this); withdraw and take down, each read back after a reload.
 - Earnings and payouts: make real non-zero data (a buyer pays for a wish in the creator's premium style on the
   stack): the screen's kobo equal the server's, the share is the ruled one (HD2: of the price in force), the
   payout rows show the server's day and threshold (R14) and nothing typed in the web.
 - What is drawn that does nothing: the builder says sound, 3D model, poster and profile-picture uploads and
   "Signed off / move to Open" are NOT drawn because the server has no route. Confirm none of them is on screen as a
   dead control, and that a picture uploaded in the editor is honest after a reload (the builder says the server
   gives no read address: what does the person see: a broken image, an empty frame, or words?). A person who loses
   a picture they uploaded with nothing said is HIGH.
 - Dictation (R13, GC1): the editor's speak control uses the browser's own dictation and sends text only; with no
   dictation in the browser the control is not a dead one.
 - Light and dark: the builder says the app frame stayed dark under light mode. Is that the base's behaviour
   (compare 7b5d6e6) or new?
 - Every open ui-align id the builder marks done in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w10-studio-ui-align.txt: sample 20 and check.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove your worktrees, stack and databases; leave no background jobs.
