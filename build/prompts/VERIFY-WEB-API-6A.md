VERIFIER WEB-API-6A | TIER T2 full with the money attacks (a stranger pays at a link), measured in a browser on a real API stack | Budget 130 steps.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time (a build, a stack, a driver
run: never two), and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-6a/NOTES.md as you go. Stop ONLY processes you
started, by the PIDs you recorded. You did not build this. Test, do not trust. You fix nothing. If NOTES.md or your
worktrees already exist, an earlier verifier was lost to a restart: read NOTES.md and carry on.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is
/home/user/Firstwish-API/build/prompts/WEB-API-6A.md (with its ADDED note); rulings HS1, HS2, HU1-HU4, R10, R11 in
build/rulings.md and rulings-phase3.md; the contract's E-257..E-265; the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-6a-claims.txt.
Under test: /home/user/Firstwish-web local branch `web-api-6a` (head and base in your spawn line). Your OWN detached
worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa6a (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-wa6a-api (API at the commit in your spawn line); stack prefix
vwa6a; ports 5640-5659; the stack BUILT (`npm run live:up -- --built`); run the driver as
`node scripts/live/drive.mjs` on a FRESH stack (never under `timeout npm run`); verify folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-6a/ (pictures in shots/). Run every command with your own worktree as the working directory.
Besides the common list, attack (money first; count payments, the wish's term and the ledger on the server after each):
 - Keep and wake with no account: a double tap; two tabs; TWO DIFFERENT BROWSERS (two holders) paying at once; the
   owner pays while a holder's payment waits; back then pay again; a lost answer on the start, then a retry; a paid
   return opened twice, in another browser, and with a forged or another wish's reference. One term added per paid
   payment, or the second is "refund due" in the server's words (HU3). Anyone charged with nothing added and
   nothing said is HIGH.
 - HU1: no account is made or implied by paying (count accounts before and after; an email that has an account and
   one that has none see the same screens; the email is said to be for the receipt). The return lands on the link.
 - Who sees the offers: a house wish (none, and a typed request is refused); a passcode wish (only after the
   unlock); resting (the wake, drawn from the server's 200; ended and removed stay the 410 words).
 - /g/<slug> (new, not on the canvas): shows only who asks and for whom; the upload (progress, retry, over the
   limit, a wrong kind, screening refusal); 13 friends; the link turned off while a friend records; the wish
   already open; a second send from the same friend; nothing else of the wish in the page or its network answers.
 - The maker's gather step: link on and off, voices arrive without a reload, remove asks first, the count of 12
   leaves out the owner's own voice (HU4); two tabs.
 - The ring's "Yes": after a reload and in a second tab it is one person; the web sends no visit id of its own.
 - R10: print storage and cookies after every step (only the server's session cookie where signed in). Measure
   the link, /g/<slug> and the gather step at 360, 390, 1440, light and dark; pictures of /g/<slug> for the owner.
 - The flow wa6a.mjs alone: 0 FAIL; the whole driver on a fresh stack: 0 FAIL (the old W7 resting FAIL must be
   gone); typecheck, gates, test:client EXIT 0; sample 10 ui-align ids the builder marks done (SHOW each).
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove YOUR worktrees, stack and databases; leave no background jobs.
