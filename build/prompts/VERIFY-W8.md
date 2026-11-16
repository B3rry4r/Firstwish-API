VERIFIER W8 | TIER T2 full with the money attacks, measured in a browser on a real API stack | Budget 120 steps.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W8.md;
rulings ZB3, ZB4, ZB5, HF1, HF3, HJ1, FA1, HD4 in /home/user/Firstwish-API/build/rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `w8-business1` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w8-business1
(web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w8-business1-api (API); stack prefix vw8; ports 5460-5479; verify folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w8-business1/ (pictures in shots/). The branch's typecheck has 2 errors in lib/staff-screens.ts that
belong to another bundle (the API's staff types moved): to build, patch that file LOCALLY and never commit it; say so.
Besides the common list, attack (money first):
 - Paying twice: the builder saw two tabs each pay for the same plan and BOTH payments succeed (2 invoices, one live
   plan). Reproduce it for a plan and for a pack: what does the business end up charged, what does the server mark
   on the second payment (a refund due? read the payment rows, the ledger and the staff ledger read), and what does
   the screen tell the person in each tab? Is there any way from the screens alone (no second tab: back, reload,
   double tap, a slow return) to be charged twice for one plan? A person charged twice with nothing said is HIGH even
   if the API flags it for staff: name which side must change (the API refusing the second start; the web showing a
   payment already under way).
 - Who may pay: a login (not the owner) starts a plan payment and gets 201 (the builder saw it): is that as the
   contract and rulings say? What each of owner and login may do on every write of these six screens (a table), from
   the screen and by direct call; a removed login; a login of ANOTHER business.
 - The pack counter (HF1, HJ1, ZB3): buy a pack of 5, start 5 client wishes, a 6th (the server's words), remove two
   drafts, start two again, refund the pack as staff (through the API): after each act the screen's counter equals
   the server's; a client wish started in two tabs at once draws one wish each or one in all (say which and whether
   the counter is right).
 - Plans: buy, change up, change down with more logins than the new plan allows (HF3: the server's words), a plan
   bought while a pack is held; prices and VAT lines equal the price book (compare kobo); invoices listed and opened
   equal the API; a failed, a left and a reversed payment leave the plan as it was.
 - People and dates: 29 Feb, the same person twice, an import of 200 rows with 3 bad ones (the server's words per
   row), edit then reload; the half-width date field's placeholder at 360 (not truncated).
 - Brand: every field saved and read back; the logo upload cannot be proven on this stack (the stand-in storage takes
   no put): what does the screen show a person who picks a logo today: an honest refusal, or a spinner for ever?
 - The business side's existence: a person with no business side; the builder says the shell's set-up form
   (SetUp.tsx BusinessForm) only sets the account in memory while its own page calls the server: walk both ways in
   and say whether a business can exist on screen but not on the server.
 - What it left: lib/pro-data.ts and lib/pro-api.ts still hold the old on-device store and code for W9 and W6: does
   any of the six wired screens still read or write the fw-pro store (print storage after every screen)? The maker's
   seal on a plan (W6, unwired) and the Vault (W9) still open without a crash on this branch.
 - Preview links: a client wish's preview carries the wish's id and opens; a sealed one shows the server's /w/<slug>.
