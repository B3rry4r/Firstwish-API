VERIFIER INT-4 | TIER T2 full, money and identity | Budget 100 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-4.md (its cases are the contract),
and in build/rulings-phase3.md: GG1-GG7, HH8, II2-II5, JJ1, LL1-LL5, MM1, NN7.
Under test: local branch `int-4` at e866a5c of /home/user/Firstwish-API against claude/sleepy-mayer-f0hkb8 (`git diff --stat` first: 60
files). Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-int4 (detached at e866a5c; `npm ci`); ports 4690-4699; TEST_DB_PREFIX=vint4 for every run;
a clock in 2185 for your own cases; remove both when done; kill by PID.
Known and NOT findings: `int1-rulings` U1 and U4 (timing) and "50 wishes sealed at once" (counts across the shared database)
fail now and then, also on the base; the seed resets staff-edited wording on a re-seed; PublicWishView carries opening and
files twice. A FINDING if true: any route whose answer differs from its registry contract (the builder says the seal
contract says PaymentStarted<Wish> and the service answers the Wish: check every seal path and say which is right by INT-4.md).
Attacks (work each expected count and ledger by hand first):
 - Nothing granted twice (GG1): the same payment settled 20 times at once and replayed by webhook: one grant row per line; a
   refund revokes exactly that grant; a revoked grant cannot be spent; what a grant gave cannot be spent twice.
 - The start check (GG3): a ticket for a wish that already has one; a ticket for another account's wish; a lower ticket after
   a higher; a start with no wish where one is needed: 422 before any payment row or provider call (count them).
 - The Pass: wishes within fair use, the one past it; upgrades, the one past four; 20 seals at once with 1 Pass wish left and
   20 upgrades at once with 1 left: exactly 1 each; an upgrade alone never seals a wish for free; a Pass that ran out
   yesterday; a refunded Pass; another account's wish; the pass_draw rows equal what was drawn; E-241 against its contract.
 - Business (GG4): pack wishes and Vault space come from live grants: a lapsed or revoked grant gives nothing; 20 uploads at
   once near the Vault edge never pass it.
 - The wire (GG7, HH8, II2, II5, MM1, NN7): the legacy wish fields are gone from every answer (read raw JSON of each wish
   route); E-225 sets and clears the passcode and never returns it; delivery purpose and status hold only registry values.
 - II3, II4, JJ1: a repeated idempotency key under 20 at once gives one row; a bad time zone is 422 and a good one changes
   the day of a reminder as worked by hand; a body of 512 KB + 1 byte is 413 in the envelope on three routes, 512 KB passes.
 - The migration: on a database at the base's last migration, insert rows shaped like live data (duplicate keys, each old
   enum value, a grant pointing at a missing wish, a wish with every legacy field set), then migrate: no row lost, no error;
   `prisma migrate diff` shows no drift.
 - Erase: an account with grants, Pass draws, a business with a pack and Vault files: after the erase list what stays in
   purchase_grant, pass_draw and the five new tables; no personal data may stay; money rows stay.
 - Link hits (LL4): the cleanup job removes only old rows; run twice and at once: the limits still hold right after.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules src/common test` twice (name any failing test and whether it is one of the known ones).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int4/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
