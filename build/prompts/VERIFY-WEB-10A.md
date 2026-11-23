VERIFIER WEB-10A | TIER T2 (a receiver's secret), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes as you go to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-10a/NOTES.md (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, /home/user/Firstwish-API/build/prompts/WEB-10A.md (its cases are the contract), rulings IK1, IK2 (the END of
/home/user/Firstwish-API/build/rulings-phase3.md), Q8, GG7, LL3 there and R10 in /home/user/Firstwish-API/build/rulings.md.
Under test: /home/user/Firstwish-web local branch `web-10a` (head b0c15e4, made from 687a3a9) against claude/sleepy-mayer-f0hkb8 (3c9089b). Your own detached
worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w10a (the branch) and, only if you need a before, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w10a-base
(`npm ci` each), and an API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w10a-api at the API commit in your spawn line; ports 5660-5679;
stack prefix vw10a; BUILT; stand-ins only. Probes under the verify folder, not in the repo.
The builder's claims: the code and the answer go ONLY as the draft save's `passcode`; values hold the hint (and the
question's text); hasPasscode true after the save; reload says "A passcode is set" with "Change the code"; storage,
address and cookie empty; the 4-to-64 rule said before the save and the server's words at the field; Continue off
until a secret is set or typed; away from a secret or passcode <-> question sends `passcode: null`; the sender's
preview looks past the gate and never reads a secret from content; end to end in the maker's own screens (paid by
the stand-in, sealed) the signed-out gate refuses a wrong code and opens on the right one; w10a.mjs 48 PASS 4 runs;
maker flows w4-maker1, w5-maker2, pf1, p-w5, w6-maker3 0 FAIL; w5b 1 FAIL ("4a a voice note plays after a reload")
NOT compared with the base; lint 867 warnings NOT compared; lib/draft.ts casts the contract type to send null.
Attack in a real browser at 360 first, through the maker's OWN screens including its seal screen (each PASS or FAIL with what you saw):
 - The secret leaks nowhere: every request and response of a whole make-pay-seal-open run (HAR or a network log): the
   code or answer appears ONLY in the body of the draft save (and the receiver's unlock); never in content, a GET, a
   list, the business or staff reads of that wish, the address, the page source, the built JS, storage, cookies, the
   console, an error message, the stand-in mail.
 - Lost secret: type a code, then change another step, go Back, reload mid-typing, lose the network during the save
   (offline, 500): can the maker ever say "A passcode is set" when the server holds none, or seal a wish whose
   opening needs a secret with none stored? (The server does not refuse that seal yet: round 19 will; say what
   the web does today.) Two tabs on one draft: one sets, one clears.
 - Change and clear: change the code (old one refused at the link, new one opens); passcode -> question -> sealed ->
   passcode; a kind or occasion change that removes the passcode opening: is the hash cleared?
 - Edges: 3 and 65 characters, only spaces, emoji, leading and trailing spaces (what is hashed?), a paste of 5000.
 - Every maker that can set an opening: a person's wish, a business order's wish, a group wish, a Concierge order
   (name each you could reach and each you could not).
 - w5b "4a": run it on the base too: pre-existing or new?
 - 390 and 1440, light and dark: no side scroll; keyboard only: the field, Change the code, Continue; no dead control.
Then the checks: tsc, gates (289 accepted, 0 new; scripts/gates and the baseline untouched in the diff), test:client,
lint (compare the warning count with the base), check:css, build; w10a.mjs once.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-10a/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity
with file:line. Stop your stack and browsers by PID, drop your databases, remove your worktrees. Hand back ONCE in 15 lines.
