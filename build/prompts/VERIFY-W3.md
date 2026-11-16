VERIFIER W3 | TIER T2 full, measured in a browser on a real API stack | Budget 110 steps. Machine: 4 CPUs, 15 GB; a heavy
job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W3.md.
Under test: /home/user/Firstwish-web local branch `w3-app` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w3-app (web) and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w3-app-api (API); stack prefix vw3; ports 5300-5319; verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w3-app/ (pictures in shots/).
Besides the common list, attack:
 - Money (keep, wake, Pass, each with the stand-in payment page): pay and return; abandon; fail; pay twice in two tabs;
   back after paying; the webhook arriving before and after the return: the screen always shows the server's state, one
   payment per intent, the price shown equals the price book's kobo at the server; a Pass holder's wishes show as covered.
 - Wish detail of each state (draft, sealed, opened, ended, kept): only the controls the server allows are drawn; share
   gives the server's link and it opens; video and publish absent when the server says no; removing a draft asks first.
 - Dates: 29 Feb, a past date, the same date twice, 50 dates (paging or scroll), edit then reload, remove then reload.
 - You: a name of 1 and of 80 characters and one with an emoji or script tag (stored and shown as text); light/dark saved
   on the account (a fresh profile shows it); sign-out; erase (the server's words and what the next sign-in shows).
 - Another person's wish id, date id and Pass: 404 or 403 with the designed state. lib/account.ts: what is left and who
   still reads it (list importers): nothing these screens show may come from it.
