VERIFIER B19 | TIER T1 lean plus the payment start | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B19.md (the cases are the contract),
rulings CA1-CA3, A9, Z2 in build/rulings-phase3.md.
Under test: local branch `b19-concierge-cards-video` (head fe5db16) of /home/user/Firstwish-API; base: local branch int-4 at e866a5c.
Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b19 (detached at the branch; `npm ci`); ports 4870-4879; TEST_DB_PREFIX=vb19 for every run; a clock in
2191 for your own cases; remove both when done; kill by PID.
Known and NOT findings (CA1-CA3): only a single wish with no Pass can be paid; routes and bodies outside the registry; given
and being made are one state; no email on delivery; the invoice link is empty; refund_due set in the module's own code; no
real renderer.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b19/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - Money: the price on the order by hand at list and at 40% off, with and without a Pass; a price-book change after placing
   does not move the order; paying another account's order, a cancelled order, a paid order again (20 at once: one payment
   settles, the others refused before any provider call); a cancel racing the payment (never paid-and-cancelled without
   refund_due; never cancelled with the money kept and no flag); count 0, negative, 10,000, a float.
 - Someone else's: another customer's order id on every customer route; a maker reading or delivering another maker's order;
   a maker who is switched off; delivering with another account's wish ids, a draft, the same wish under two orders at once.
 - The report: it shows only the order's own wishes and no receiver contact.
 - QR card: the SVG holds the right link for each wish (decode the QR with a library or compare the encoded matrix to one you
   make yourself from the link: say which); a name with a script tag or an XML entity is escaped (stored XSS in an SVG is
   HIGH); a wish without the card after its ticket was refunded is 402; 20 asks at once make one card.
 - Video: 20 asks at once make one job; an ask with no renderer writes nothing; a job stuck rendering is retaken once, not by
   two workers; the file of a ready job is reachable only by the wish's owner (and the receiver when the wish rests, if the
   brief says so: say what happens).
 - Staff: every staff role on each staff route against the registry; reasons and audit rows.
 - Errors: the envelope; no 500 for a non-uuid id, a bad cursor, a NUL byte.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/concierge src/modules/qr-cards src/modules/render-jobs src/modules/payments` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b19/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
