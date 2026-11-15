SCHEMA (Phase 4) | TIER T2 | one task: the database schema, migrations and the shared contracts package. Budget 220 steps. Heavy agent.
Read /home/user/Firstwish-API/build/common-rules.md, .pipeline/conventions.md, README.md (how the skeleton runs), src/common (what exists:
ids, money, time, normalise, validation: use them, do not re-make them), and § Schema in
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/references/agent-prompts.md (lines 136-150).
Owner's words: > "Back end Nest.js." (R1) > "Nothing should be stored on the browser." (R10: every piece of data the app shows has a home here.)
Inputs, FROZEN, read-only: .pipeline/registry.json (105 resources, 233 endpoints; 650 KB: NEVER print it whole; first write
tools/pipeline/show.py to print one resource's fields, endpoints and sources compactly, and a one-line-per-resource index),
.pipeline/dep-graph.json (7 waves), .pipeline/field-flow.json, .pipeline/decisions.json (by id when a field cites one), .pipeline/declared/*.json.
Do:
 1. Classify every registry resource in .pipeline/schema-map.json: "table" (something writes it), "view" (read only, worked out from
    named tables: no table of its own), "config" (price book, settings, templates: tables staff change), "document" (stored whole as
    validated JSON inside a table, for example a Studio style or a wish's content), "not-stored" (kept in the web app by ruling). One
    line of reason each. Rule: a thing with a writer is never a view; when unsure it is a table.
 2. prisma/schema.prisma for every table, config and document: UUIDv7 ids, money as BigInt kobo (never Float or Decimal), time as
    timestamptz UTC, date-only as date, enums for every state the registry lists, relations per dep-graph.json, uniques the contracts
    imply (email, handle, link slug, wish number, payment reference, idempotency key, webhook event id), indexes for every list filter
    and cursor the endpoints name, an append-only ledger (no update or delete: enforce with a database trigger in the migration), an
    audit table written in the same transaction as the change, soft states where the registry has resting or erased (erase really
    removes personal fields). No field or table that the registry, a declaration or a decision does not ask for.
 3. Migrations that run clean on a fresh database and on the stack's template; a seed for reference rows only (price book lines in
    kobo from declared/price-book.json, staff roles, lifecycle config, the PROVISIONAL payout threshold): never sample people or wishes.
 4. The shared contracts package src/contracts/**: one typed request and response shape per registry endpoint and one per resource,
    with validation in the skeleton's own way (src/common/validation), exported from one index so no builder re-declares a shape; and
    `npm run contracts:export` writing contracts/firstwish-contracts.d.ts for the web app (types only, no runtime import of the API).
 5. A gate: scripts/check-contracts.mjs (exit code): every registry endpoint has a contract; every table in schema-map exists in
    schema.prisma; no Float/Decimal on a money field; registry.json's sha256 equals .pipeline/registry.lock.json. Add it to scripts/gates.sh and CI.
FORBIDDEN: editing .pipeline/registry.json or any other pipeline input; controllers, services, modules; "improving" a contract shape.
HALT AND REPORT (do not patch) if a contract cannot be represented, or two contracts need one column to be two things.
Work: local branch `api-schema` from claude/sleepy-mayer-f0hkb8; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-api-schema (`npm ci`); ports 4040-4049; database prefix sch.
Checks (quiet logs, EXIT lines): build, lint, typecheck, `prisma migrate deploy` on a fresh database then `prisma migrate diff` shows no
drift, the seed runs twice with the same result, check-contracts, gates.sh, the affected specs (a spec per trigger: a ledger row cannot
be updated or deleted; a duplicate idempotency key, payment reference and webhook event id each refuse).
Commit at each milestone (do not push); remove your worktree and databases. Hand back in 12 lines: head sha; counts (tables, views,
config, documents, not-stored; enums; contracts); CLAIMS one per line, testable; every HALT with its two sources; what did not run; EXIT lines.
