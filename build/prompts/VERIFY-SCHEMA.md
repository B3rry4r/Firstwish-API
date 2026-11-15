VERIFIER SCHEMA | TIER T2 full | Budget 100 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, .pipeline/conventions.md, build/prompts/SCHEMA.md and SCHEMA-P1.md (the contract),
build/rulings-phase3.md (the sections on admin and "Registry reopened once").
Under test: local branch `api-schema` (head 547310f) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-api-schema (detached at api-schema; `npm ci`); ports 4060-4069; database prefix vsch; remove both when done; kill by PID.
Use `python3 tools/pipeline/show.py` to read a resource or endpoint; never print registry.json whole.
CLAIMS (each: PASS or FAIL with the command and what you saw):
 1. build, typecheck, lint, gates.sh, check-contracts end EXIT 0; `prisma migrate deploy` on a fresh database is clean and
    `prisma migrate diff` shows no drift; the seed run twice leaves identical rows (sorted dump).
 2. registry.json's sha256 equals .pipeline/registry.lock.json; reconcile.py refuses to run while locked (exit 2).
 3. Every one of the 233 endpoints has a request and a response contract exported from src/contracts' one index; contracts:export
    writes a .d.ts with no imports.
 4. No Float or Decimal on money; ids uuid; times timestamptz; dates date. Uniques exist: payment provider reference, idempotency key,
    webhook (provider,eventId), wish number, link slug, account email, account handle, creator handle, staff email, price (sku,version).
 5. ledger_entry refuses UPDATE, DELETE, TRUNCATE; audit_entry refuses UPDATE (try each in psql, also as the table owner).
 6. P1 to P4: NumbersTarget exists with a unique (line, period); no payment-start contract accepts amount or price (422); no contract
    or enum names sms or whatsapp; the WebhookEvent to Event edge is gone.
Attacks:
 - schema-map: pick 12 resources classed "view" and 6 classed "config"/"document"; with show.py prove each view has NO writer in the
   registry (an action or declaration that changes it). A view with a writer is a HIGH finding (data with no home breaks R10).
 - R10 sweep: for 15 fields the web app keeps in the browser today (take them from .pipeline/stubs.json and field-flow.json: the draft
   wish and its content, maker note, voices, mode, the Pass, Pro state, Vault files, Studio drafts and prefs, saved wishes, dates),
   name the table and column that holds each. A field with no home is HIGH.
 - Money: every money field in 10 payment, ledger, payout, price and invoice contracts is integer kobo on the wire and BigInt in the
   table; BigInt serialises to JSON without throwing and without losing digits above 2^53 (find how; a missing serialiser is HIGH).
 - Ledger: can a ledger row be changed through a cascade (delete its payment or account)? What do the foreign keys do on delete?
 - Erase: erasing an account can blank its personal fields while its payments and ledger rows stay; which columns keep personal data
   outside Account (names on wishes, emails on deliveries, support threads)? List them: each needs an erase rule (MEDIUM where missing).
 - Identity: is account email unique case-insensitively (two spellings of one email must be one account)? handle too. Is the wish
   link slug unguessable in length by the schema's own limits? Sign-in code stored hashed, with expiry and tries columns?
 - Concurrency columns the money paths will need: a version or state column to lock on for Payment, Wish seal, Payout, PassMembership,
   ProUsage counters, credits (CreatorState): is there something to lock or a constraint that stops a double grant? List gaps.
 - Indexes: 10 list endpoints with filters or cursors: the index that serves each exists.
 - Known, not yet ruled (report, do not count against the builder): E-19 still lets the sign-in contact be a phone.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-schema/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line or resource; what you did not run and why.
