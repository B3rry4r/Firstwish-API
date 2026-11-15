# Phase 5 builders: what every bundle does (read after build/common-rules.md)
- Contract first. Your endpoints are in the FROZEN registry: `python3 tools/pipeline/show.py <Resource>` and `show.py endpoint E-<n>`.
  Their shapes are already typed in src/contracts (import them; never re-declare a shape). Tables are in prisma/schema.prisma; why a
  resource is a table, view, config or document is in .pipeline/schema-map.json. Rulings: build/rulings.md (owner), build/rulings-phase3.md
  (lead), .pipeline/decisions.json (by id). The registry or the schema is wrong or cannot say what you need: HALT AND REPORT; never patch
  around it, never edit .pipeline/**, prisma/schema.prisma, a migration, src/contracts/** or src/common/** (ask for a shared change in the hand-back).
- One NestJS module per resource under src/modules/<name>/ (controller, service, tests); register it in src/app.module.ts in a block
  headed with your bundle id (other bundles add theirs: only add). Use the kernel: guards in src/common/auth, Money, ids, time,
  normalisers, pagination, the ports in src/common/ports (never a real provider: the stand-ins), the clock port (never Date.now()).
- Money: integer kobo, priced by the server from the price book, never from the request. Every write that moves money or state runs in
  one transaction, takes a row lock or uses the row's `version`, and is safe to send twice (Idempotency-Key where the contract has it).
- Every route is default-deny: say its auth with the guard decorators exactly as the registry gives it. An owner check is a query
  condition, not an if after the read. Staff routes: role from the registry; a changing staff request carries `reason` and writes one
  audit row in the same transaction (the audit helper, once B03 is merged).
- Contract tests per endpoint (test kit: test/kit/app.ts createTestApp): the happy shape; 401 without a token; 403 wrong role or not the
  owner; 422 with fields for a bad body; a non-canonical input normalised; and what your brief's cases list. Tests own their rows.
- Learned from the first two bundles (binding): a counter or limit is changed in ONE statement that cannot be raced (UPDATE ... WHERE
  count < limit RETURNING), never read-then-write; limits are counted in the database and fail closed (a dead Redis or database
  refuses the request, never lets it through); a unique violation is a 409, never a 500; an id that is not a uuid is a 404 or 401,
  never a 500; anything two requests can do at once has a test that really runs them at once.
- From the second wave's checks (binding): every write that belongs to an account goes through the kernel's account-lock helper
  (locks the row, checks erasedAt inside the transaction: nothing lands on an erased account; rulings AA1); every text or json
  column you add to an owned table gets an erase rule in schema-map.json (a gate fails without it; AA2); a signed upload never
  points at a file's final key (Y1); a file's type is decided from its bytes (Y3); storage and other slow calls happen outside
  a database transaction (Y4); a link is stored as new URL(v).href, https only (AA4).
- Specs share one database: a spec that runs due jobs passes the keys it means (runDue(limit, only)), uses its own
  addresses (uniqueAddress()) and a clock no other spec reaches, and looks rows up by id, never items[0]. A test that passes
  three times in four is a finding: find the cause.
- A gap you notice is a task, not a comment: no "out of scope", "later", "this wave", TODO in src (the gate refuses them). Say it in the hand-back.
- Checks (quiet logs, EXIT lines): build, typecheck, lint on changed files, `npm run test:affected -- <your paths>`, scripts/gates.sh,
  scripts/check-contracts.mjs; T2: `scripts/stack.sh up <prefix> <port>` and the cases by real HTTP (curl), then down.
- Commit on your local branch (do not push); remove your worktree and databases. Hand back in 10 lines: head sha; per endpoint id done
  or not; CLAIMS one per line, testable; every HALT with its two sources; what did not run against a real provider; EXIT lines.
