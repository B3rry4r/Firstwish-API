VERIFIER SCHEMA round 2 | TIER T2, re-check of named findings | Budget 45 steps. You did not build this. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-schema/VERDICT.md (round 1: the findings), and the section
"Registry reopened a second time" (Q1 to Q14) of /home/user/Firstwish-API/build/rulings-phase3.md.
Under test: local branch `api-schema` (head e30b8ba) of /home/user/Firstwish-API. Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-api-schema (detached at
api-schema; `npm ci`); ports 4080-4089; database prefix v2sch; remove both when done; kill by PID. PostgreSQL and Redis are up.
For EACH finding of round 1 (every HIGH, MEDIUM and LOW line) say CLOSED or OPEN, with the command you ran and what you saw. Prove
in a real database, by your own inserts in psql or a throwaway script (not by reading the builder's specs):
 - a second pass_membership for one payment; a second payout for one creator and month; a second royalty accrual for one payment and
   creator; a negative kobo amount; negative credits; payment.fulfilledAt set twice: each refused.
 - Ada@Example.com after ada@example.com; the same handle in another case: refused. A calendar date column has type date.
 - an audit row: UPDATE and DELETE refused; a ledger row: UPDATE, DELETE, TRUNCATE refused; deleting a payment with ledger rows refused.
 - a response carrying a BigInt serialises to a JSON integer (run the builder's spec, then read the interceptor: is it applied to
   EVERY route, including errors and streamed or raw responses?).
 - E-124 accepts priceKobo 500000 with a reason and refuses a body with none of the three; a refund of -50000 or reason "r" refuses;
   E-19 refuses a phone contact and any channel; no payment start accepts amount; PublicWishView's contract has no passcode or answer.
 - Account.mode exists with its three values and is settable through /v1/me's contract.
Also: build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database, migrate diff no drift, seed twice (sorted
dump identical): EXIT lines. registry sha equals the lock. Anything NEW that is high or blocker: report it; do not go looking for lows.
Judgement calls the builder made, to confirm or dispute in one line each: slug minimum 8 characters; audit_entry.actorId and
numbers_target.setBy with no foreign key; *FileId columns unlinked; audit_entry.ip kept; ApprovedDate not seeded (business data).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-schema/VERDICT-R2.md (30 lines or fewer). Hand back in 15 lines or fewer: verdict merge or fix; each OPEN finding
with severity and file:line; what you did not run.
