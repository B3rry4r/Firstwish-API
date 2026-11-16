VERIFIER INT-5 | TIER T2 full, shared base | Budget 100 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-5.md (its steps are the contract), and
in build/rulings-phase3.md: OO4, PP1-PP3, QQ1, QQ2, QQ6, VV1, VV3, WW3, WW4, WW7, XX4, YY1-YY3, ZZ5, ZZ8, ZB3, EA1, EA2, CA2, CB3, CB4.
Under test: local branch `int-5` at e1b1999 of /home/user/Firstwish-API against 56cbe21 (`git diff --stat 56cbe21 int-5` first). Your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-int5 (detached at e1b1999; `npm ci`); ports 4970-4979; TEST_DB_PREFIX=vint5 for every run; a clock in
2199 for your own cases; remove both when done; kill by PID.
Known and NOT findings: the seal accepts usePlan and does nothing with it yet (a patch follows); ZB3's and ZZ5's behaviour is
not built; raw SQL still used on tables that are now models; jobs.spec's tick test can fail under load on this branch (fixed
on the work branch after this base was cut); Resend, Paystack and S3 never run.
Attacks:
 - The gates: `git diff 56cbe21 int-5 -- scripts/ tools/pipeline/ .github/ build/baselines/`: read every changed line. Did any
   gate get WEAKER (check-contracts.mjs now reads erase rules of join tables: prove it still fails on a text column with no
   erase rule in a resource table AND in a join table: add one in a scratch copy and run it; check-drift with an empty
   baseline still fails on a made-up raw table)? A gate made weaker is a BLOCKER.
 - The migration: on a database at 56cbe21's last migration insert rows shaped like live data in every table the migration
   touches (the 16 that became models, wish with and without legacy columns set, refund, payout with a hand mark in the
   audit, accruals with and without a wish, deliveries in every status, concierge orders in every state), then migrate: no
   row lost (counts per table before and after), no personal column silently dropped that the erase must still blank; with
   a wish holding legacy data the migration stops and changes nothing (the whole migration rolls back: check a table
   created earlier in it is gone). `prisma migrate diff` no drift; migrate deploy twice is a no-op.
 - Erase: an account with rows in every new model (studio snapshot, reveal access/play/send, support thread with a name, payout
   detail, royalty reversal, concierge ext, email suppression, intake count, invoice link): after the erase scan EVERY table
   for the name, email, phone, typed text: none; money rows stay.
 - Contracts: for each new or changed route (E-242 to E-254, E-231, E-148, E-133, E-84, E-63, E-154, E-41, E-34, E-141, E-36,
   E-186, E-192) one real call: the answer has the registry's shape (check-contracts passes; read raw JSON for three of
   them); E-242 lifts a ban for owner and ops only; saved replies: add, change, remove by the registry's roles; the contact
   page keeps its limits; the customer's Concierge routes show only their own orders.
 - The guard: UserOrStaff on E-141: every refusal of the old route still refused (no token, expired, wrong key, switched-off
   staff, wrong role, another's wish); no other route got UserOrStaff by mistake (grep). The resend webhook provider: bad
   signature, old timestamp, no secret (503), replay.
 - Ports: the moved refund and payout ports behave as before (run refunds and payouts specs); email replyTo reaches the
   stand-in on a staff reply and fetchReceived is used when the event has no text (a missing email is 409 and stores
   nothing); putObject works on the stand-in and the S3 adapter signs what the read side can read (unit level).
 - The unique on accruals: one per payment and creator when there is no wish, one per payment, creator and wish with one;
   20 at once each way.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, check-drift, migrate deploy on a fresh
database, seed twice, `npm run test:affected -- src/modules src/common test` twice (name any failing test and whether it is the
known tick test).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int5/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
