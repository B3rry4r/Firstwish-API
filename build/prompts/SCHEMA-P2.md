PATCH SCHEMA round 2 | TIER T2 | Budget 130 steps. Close the verifier's findings; reopen and re-freeze the registry once more.
Read /home/user/Firstwish-API/build/common-rules.md, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-schema/VERDICT.md, and the LAST section (Q1 to Q14) of
/home/user/Firstwish-API/build/rulings-phase3.md (read it from that path; do not edit build/**).
Branch `api-schema` (head 547310f) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p2-api-schema (`npm ci`); ports 4070-4079; database prefix p2sch.
Do, in this order:
 1. Registry (Q1, Q3, Q12, Q13, and any Q that changes a wire shape): decisions appended (lead default; Q1 cites R10, Q13 cites R11),
    table entries, `python3 tools/pipeline/reconcile.py --reopen "Q1,Q3,Q12,Q13"` twice (identical, EXIT 0, 0 open conflicts), then
    tools/pipeline/freeze.py with a new freeze decision.
 2. Schema (Q4, Q5, Q7, Q8, Q9, Q10, Q11): through schema-map.json and gen_schema.py where they are generated, in NEW migrations
    (never edit one already made); CHECK constraints and lower() unique indexes in raw SQL in the migration; the erase rules in
    schema-map.json for every personal column; the seed export script for the 9 config tables (reads /home/user/Firstwish-web files,
    writes prisma/seed-data/*.json, committed; the seed stays identical on two runs).
 3. Contracts and kernel (Q2, Q6, Q12, Q14): the BigInt serialiser in the skeleton's response path with its test; refund and price
    DTOs; 204 contracts; regenerate; contracts:export.
 4. Specs (one each, real database): a second pass_membership for one payment refuses; a second payout for one creator and month
    refuses; a second royalty accrual for one payment and creator refuses; a negative amount or negative credits refuses (CHECK);
    Ada@Example.com and ada@example.com cannot both be accounts; one handle cannot be taken twice in any case; an audit row cannot be
    deleted; a calendar date round-trips with no time; a money response serialises; deleting a payment that has ledger rows refuses.
Anything a ruling cannot represent: HALT AND REPORT, do not patch around it. A finding you judge wrong: say so with evidence, do not skip it silently.
Checks (quiet logs, EXIT lines): build, typecheck, lint, migrate deploy on a fresh database, migrate diff no drift, seed twice,
check-contracts (new lock), gates.sh, the affected specs.
Commit on `api-schema` (do not push); remove your worktree and databases. Hand back in 12 lines: head sha; each finding of the
VERDICT closed or not, by its text, with proof; counts; any HALT; EXIT lines.
