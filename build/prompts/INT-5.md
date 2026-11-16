BUILDER INT-5 | TIER T2 | Wave 6, the shared base: one registry reopen, the raw-SQL tables as models, kernel ports, and the joins they force
Budget 220 steps. Machine: 4 CPUs, 15 GB; heavy agent. You own the shared parts for this task: .pipeline/** through the tools,
prisma through schema-map.json + gen_schema.py and ONE new migration, src/common/**, test/kit/**, scripts/**, the seed,
build/baselines/drift-tables.txt (remove a line when its table becomes a model; never add one); and you may touch
src/modules/** only where a shared change forces it (list each touch).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/INT-4.md (how the last one was done), then in
build/rulings-phase3.md the lines OO4, PP1-PP3, QQ1, QQ2, QQ6, VV1, VV3, WW3, WW4, WW7, XX4, YY1-YY3, ZZ5, ZB1, CA2, CB3, and the
rows of build/sweeps/api.md that say "next shared base" or "one masker".
Work: local branch `int-5` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API; worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-int-5 (`npm ci`); ports 4890-4899; TEST_DB_PREFIX=int5 for every run.
 1. Registry, ONE reopen (list every id before you start; a second reopen is a finding): PP2 (E-84 q and flag; E-63 day),
    QQ1 (E-133 optional code; the answer when no code), QQ2 (DELETE /v1/admin/bans/:id, owner and ops), VV1 (E-231 answers
    PaymentStartedOrCovered), VV3 (Wish gains hasPasscode, loses the legacy fields), WW7 (RoyaltyAccrual loses rows and total;
    E-154 gains summary; E-41 gains bank), XX4 (bodies for E-186 and E-192; SubmissionView.snapshot; a job kind for the
    checks), YY3 (the contact-page route; saved replies list, add, change, remove; ThreadDetail; delivery status gains bounced
    and complained), CA2 (E-34 wishIds; E-141's body; the customer's Concierge read, list, cancel and the staff cancel; E-36 a
    page; E-148 PaymentStartedOrCovered). Decisions citing the ids, `reconcile.py --reopen "<ids>"` twice identical, 0 open
    conflicts, both ADMIN lines 0, then freeze.py. Endpoint ids already issued never change.
 2. Schema, one new migration through schema-map.json and gen_schema.py, tried on rows shaped like live data (no row lost):
    every table in build/baselines/drift-tables.txt and every other raw-SQL table of the bundles becomes a model with erase
    rules (the baseline file ends empty and check-drift passes); PP3 (Refund.note); StudioStyle.version; a `name` on a
    contact-page thread; ConciergeOrder's states (given, being made), paid and due times, links to its wishes and payment;
    ClientWish.wishId (ZB1); the accrual's unique includes the wish (ZZ5); the index on MessageDelivery.providerMessageId.
 3. Kernel: one email masker in src/common (the copies in auth-codes, notices and refunds use it); the refund and payout
    provider ports move to src/common/ports beside the payments port (PP1, WW3); the email port carries replyTo and the
    Resend adapter sends it, and gains a call that fetches a received email by id which the support webhook uses (YY1, YY2;
    NOT RUN against Resend: say so); RESEND_WEBHOOK_SECRET in the env schema and manifest and a `resend` webhook provider in
    the guard (YY3); the storage port gains a server-side put for both adapters (CA2).
 4. The joins the shared changes force, each with a test named by its id: the bundles' raw SQL on tables that became models
    is replaced by the models where it is a small change (else leave it and say so); refunds, payouts, support, concierge,
    studio and showing use the new columns, routes and ports; E-231 and E-148 answer the new shape; lifting a ban works
    through QQ2 (BansService.lift exists).
 5. Everything compiles and every bundle's specs pass on the new base. ZB1's and ZZ5's behaviour is NOT yours (patches follow):
    you only make the columns and the unique.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, `node scripts/check-drift.mjs`
(with an empty baseline), seed twice, check-contracts (new lock, the erase gate), gates.sh, `npm run test:affected -- src/modules
src/common test` three times (name any test that failed in any run and why).
Do not push; remove your worktree and databases. Hand back in 14 lines: head sha; each ruling id closed or not; touches in
bundle code; counts (resources, endpoints, tests); what was NOT RUN against a real provider; any HALT; EXIT lines.
