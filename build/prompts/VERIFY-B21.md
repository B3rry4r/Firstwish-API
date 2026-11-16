VERIFIER B21 | TIER T1 lean plus staff power | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B21.md (the cases are the contract),
rulings FB1-FB4, A9, A19, TT3, P1 in build/rulings-phase3.md.
Under test: local branch `b21-staff-reads` (head d487d19) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 at 56cbe21. Your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b21 (detached at the branch; `npm ci`); ports 4940-4949; TEST_DB_PREFIX=vb21 for every run; a clock in
2197 for your own cases; remove both when done; kill by PID.
Known and NOT findings (FB1-FB4): the reveal answers 204 with no body; Numbers.lines is a list outside the registry type; the
storage setting changes nothing live; connected is read from evidence rows; no route lifts a ban by id.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b21/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - Roles: every staff role (owner, ops, finance, support, moderator, reviewer, maker) on every route of the module against the
   registry and the role table; a user token; no token; a staff member switched off mid-session. A role must never do
   through this module what it cannot do through the owning module: finance or support taking a wish down; ops or support
   refunding through the wish action (the two-person rule TT3 must hold: nobody but the owner moves money alone); a
   moderator erasing an account; a maker reading people. List every action a role can reach here and nowhere else.
 - What staff can see: read the raw JSON of every answer for a wish and a person with a letter, photos, a passcode, a bank
   account and a phone: no words, no photo address, no passcode or its hash, no full email, phone or bank number, no token.
 - The reveal: 20 an hour per staff member (the 21st refused, 40 at once: exactly 20); the audit row holds no value; a
   reveal of an erased account gives nothing; the reason is required and kept.
 - Numbers and Overview by hand: build a day with a ticket, an extra, a keep, a Pass, a plan, a Vault block, a Concierge order
   and a creator plan, one of them refunded: each of the eight lines equals your hand sum from the ledger, net of the
   refund; totals equal the sum of lines; a role sees only its parts; another period does not include the day.
 - Actions under load: 10 take-downs, 10 restores, 10 extends at once: one change each or a clean 409, one audit row per
   change; extend past any limit the brief gives; resend 20 times (how many emails go out: say); an action on a wish of an
   erased account.
 - Jobs: retry of a failed, a succeeded, a running and a missing job; 10 retries at once.
 - Settings and providers: only the owner changes; no secret or key value in any answer, also after an error; a made-up
   setting name is 422.
 - Errors: the envelope; no 500 for a non-uuid id, a bad cursor, a NUL byte, a search of 5,000 characters.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected --
src/modules/staff-reads src/modules/refunds src/modules/moderation src/modules/accounts` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b21/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
