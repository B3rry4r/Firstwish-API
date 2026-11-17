VERIFIER W6 | TIER T2 full with the money attacks (this is where a customer pays and seals), measured in a browser on a real API stack | Budget 130 steps.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time (a build, a stack, a driver
run: never two), and write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w6-maker3/NOTES.md as you go. Stop ONLY processes you
started, by the PIDs you recorded. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W6.md; rulings HA2,
ZB3, HR2, HO1, HU6, IA1, R10, R13 in /home/user/Firstwish-API/build/rulings.md and rulings-phase3.md; the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w6-maker3-claims.txt.
Under test: /home/user/Firstwish-web local branch `w6-maker3` (head in your spawn line; base 959d193). Your OWN detached worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w6
(web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w6-api (API at the commit in your spawn line); stack prefix vw6; ports 5580-5599; the
stack BUILT (`npm run live:up -- --built`); run the driver as `node scripts/live/drive.mjs` on a FRESH stack (never
under `timeout npm run`: the child outlives it); verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w6-maker3/ (pictures in shots/).
Run every command with your own worktree as the working directory.
Besides the common list, attack (money first):
 - One payment, one sealed wish, or neither (count payments, tickets, the wish's state and the ledger on the server
   after each): a double tap; two tabs; TWO DIFFERENT BROWSERS signed in as the same person paying at once; back
   then pay again; a reload on the pay sheet and on the provider's page; a lost answer on the payment start and on
   the seal, then a retry; pay in one browser and seal in the other; the builder's key is "the line bought and the
   count of ended payments": find the order of events that makes two payments share a key wrongly or one intent
   get two keys (a failed payment ending between two taps; changing the ticket then back). A person charged twice,
   or charged with no sealed wish and nothing said, is HIGH.
 - After paying: a CARD-style return through /app/wishes/return (not the stand-in's "Read the result" path): where
   does the person land, is the wish sealed, and do they have to do anything more to seal it (the builder says
   they land on the wish's page, not in the maker)? A paid ticket whose wish is left a draft with no words saying
   what to do is HIGH; say exactly what the screen shows.
 - Prices: every figure on the ticket step, the pay sheet and the receipt email equals the price book and what the
   payment start charges (kobo), with the offer on, after it ends mid-screen, and with VAT lines only where the
   server marks them; the premium-style extra bought before a ticket; the Keepsake extras ceiling; a ticket that
   does not take the draft's style (the server's words and both ways out).
 - No payment paths: a Pass seal (HA2: what it covers, the upgrade for a Premium style, a Pass that ran out
   between the screen and the seal); a business draft on a plan and on a pack (ZB3: which it draws from, what is
   left, the last wish taken by two tabs at once: one sealed, one told in the server's words).
 - Refused seals: a style above the ticket, a photo still being checked, a missing answer, a time the server will
   not take: the server's words, the step to fix it, nothing charged, the paid ticket kept and usable after the fix.
 - Sealed: the link is the server's /w/<slug> and opens for a stranger in another browser as the receiver's page
   (countdown before the time); the wish is in Wishes at once; "Make another" never touches the sealed wish.
 - Drawn against built: the four screens at base 959d193 against this branch: every control the base drew that
   the branch does not (a passcode or a question on When? share buttons on Sealed? anything on Watch): for each,
   is there a server field or route (owed: MEDIUM) or none? And any control drawn that does nothing. Measure
   maker-watch (the builder did not): 360, 390, 1440, light and dark, and that its preview is the server's draft.
 - What it deleted: components/app/Pay.tsx is gone: grep for importers; the Studio buy sheet and every other pay
   path that used it still pay (drive one). lib/pro-data.ts: does the maker still read or write the old on-device
   store (print storage after every step: R10)?
 - The flow scripts/live/flows/w6-maker3.mjs alone: 0 FAIL; the whole driver on a fresh stack: 0 FAIL but the known
   W7 resting check; typecheck, gates, test:client EXIT 0; sample 15 of the 69 ui-align ids the builder marks done
   in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w6-maker3-ui-align.txt, the designed loading, empty and error states among them (SHOW each).
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove YOUR worktrees, stack and databases; leave no background jobs.
