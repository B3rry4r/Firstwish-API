VERIFIER B20 | TIER T1 lean plus the webhook | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B20.md (the cases are the contract),
rulings YY1-YY4, PP6 in build/rulings-phase3.md, R11 and R12 in build/rulings.md.
Under test: local branch `b20-support` (head dc958e3) of /home/user/Firstwish-API; base: local branch int-4 at e866a5c. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b20 (detached at the branch; `npm ci`); ports 4850-4859; TEST_DB_PREFIX=vb20 for every run; a clock in 2188
for your own cases; remove both when done; kill by PID.
Known and NOT findings (YY1-YY4): the real email port sends no Reply-To and cannot fetch a received body; the secret is read
from process.env; the webhook route is public and checks the signature itself; two routes outside the registry; no way to add
a saved reply; the contact form's name is not stored; raw-SQL tables; refund_due set by a raw UPDATE.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b20/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - The webhook: a body changed by one byte after signing; a signature for another event id; the same id with a new body;
   several signatures in the header (one good); a timestamp 5 minutes and 1 second old and ahead; an empty secret in the
   environment (must refuse, never accept all); a 1 MB body; JSON that is not an object; 30 of one event at once.
 - Into someone else's thread: a token for thread A sent from B's address; A's token with a changed character; a token of a
   closed thread, of an erased account's thread; the header and the address naming different threads; a From with a display
   name that looks like A's address; the same token used 30 times at once (how many messages land: say). Nothing may ever
   land in, or show, another person's thread (HIGH if it does).
 - Mail loops and floods: an auto-reply, a bounce to our own reply address, mail from our own sending address: no thread, no
   email sent back; 30 new-thread mails from one address in a day (how many threads; is any email sent back for each: say).
 - Refund flag (PP6): a hard bounce on a wish-delivery email flags its payment once under 20 events at once; a bounce of a
   sign-in code, a support reply, another wish's email flags nothing; no money moves anywhere (count ledger rows).
 - Suppression: after a complaint no email of any kind but the sign-in code goes to that address, in any letter case or with
   a +tag; another address is untouched.
 - The person's side: another account's thread id on every route; a non-uuid; the contact page with a NUL byte, 5001
   characters, an address in another case and with a +tag for the limit; 30 at once with 2 left.
 - Staff: every staff role on each staff route against the registry; no full email in any staff answer or audit row; assign
   to a staff member who is switched off.
 - Erase: after an erase no table holds the address, subject or body (list every table you looked in).
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/support src/modules/notices src/modules/accounts` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b20/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
