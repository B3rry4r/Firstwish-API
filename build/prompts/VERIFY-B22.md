VERIFIER B22 | TIER T2 full, money and a stranger's access | Budget 95 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B22.md (the cases are the contract),
rulings HA1-HA3, HH4, NN2, SS1, DD1, EE7, EE8 in build/rulings-phase3.md, T-14, T-47, T-48 in .pipeline/product-truths.json.
Under test: local branch `b22-keep-wake-pass` (head bc0c3fb) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 at 14bbda0.
Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b22 (detached at the branch; `npm ci`); ports 5040-5049; TEST_DB_PREFIX=vb22 for every run; a clock
in 2203; remove both when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-b22-keep-wake-pass.
Known and NOT findings: the link travels in headers outside the registry; after a refunded Pass a wedding wish's own term is
rebuilt without the wedding-date rule (report it as LOW with the file:line); a receiver gets 409 while the owner's keep
payment is open; nothing ran against Paystack.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b22/CLAIMS.md: PASS or FAIL with what you saw.
Attacks (work every expected end date and ledger by hand first):
 - A stranger pays or wakes: a signed-in person with NO link, with another wish's link, with the right link but no unlock
   token on a passcode wish, with an expired or forged token, with a link that is switched off, of an erased or taken-down
   wish; a guessed wish id; the proof: copied from another payer, for another wish, replayed after the payment settled,
   with one character changed, signed for account A but paid by B through POST /v1/payments directly; the proof's secret (is
   it a server secret from the env; can a client make one: read keep-proof.ts). Nothing may be paid, extended or woken
   without holding the link (HIGH otherwise). The receiver learns nothing of the owner (raw JSON of every answer).
 - Does a keep or a wake by a receiver start the term or count as an open (NN2: only POST /opens does)? Compare the wish and
   its receiver activity before and after.
 - Money: each keep length by hand at list and at 40% off; the end after one keep, two keeps stacked, a keep on a resting
   wish (from now), a keep while a Pass covers it; owner and receiver each buy one: the end by hand; 30 starts at once from
   owner and two receivers: one payment, one provider call; a keep payment that fails then a new start; a refund of the
   receiver's keep and of the owner's keep (HH4: the end worked out again from the keeps that remain; never an end that is
   later than what is paid for); a refund racing a wake.
 - The Pass: a holder keeps and wakes their own wish free (no payment row, no ledger row); a holder keeping SOMEONE ELSE's
   wish pays; a Pass that ended yesterday; a refunded Pass with three covered wishes (one with a paid keep, one resting
   before, one a Moment: can a Moment be kept free by the Pass? T-02 says a Moment cannot be kept: say what happens); the
   Pass ends: the rest job rests the wish at that moment and not before; a second Pass bought after: say.
 - Wake: resting with a keep that ended; with a keep covering now; 20 at once; a woken wish is not in Now Showing without a
   new ask; the 12-month hold and the erase job are cancelled on wake and set again at the new end (by hand).
 - E-83, E-238, E-239, E-64: against the registry; another account's or business's data never shows; E-64 role matrix (every
   staff role); no email in any ledger answer.
 - The edits outside the modules (public-wishes holdLink, purchases assertStartable, wish-handlers, wish-rules, pass.service):
   the receiver link's and purchases' own specs pass; holdLink cannot be used to read a wish's content (it returns no content).
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/wish-keeps
src/modules/me-pass src/modules/ledger-entries src/modules/people src/modules/purchases src/modules/public-wishes
src/modules/wishes src/modules/payments` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b22/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
