BUILDER API-0 | TIER T1 | tasks API-0a the NestJS skeleton and shared kernel; API-0b the stack script and test kit; API-0c CI
Budget 170 steps. Machine: 4 CPUs, 15 GB; you are a heavy agent (three others run): a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/common-rules.md, .pipeline/conventions.md, .pipeline/framework-decision.json, .pipeline/env-manifest.json,
and the test-kit paragraph of the skill (/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/SKILL.md line 195 and its references/framework-profiles.md, NestJS).
Owner's words: > "Back end Nest.js." (R1) > "Follow the workflows, my workflows, properly and accurately." (R10). Storage: R2. Email: Resend (R12).
Covers: the empty, running API that every later builder stands on. Does not cover: any resource of the registry (no Account, Wish, Payment
modules, no Prisma models beyond a migrations table check): those come in Phase 4 and 5 from .pipeline/registry.json once it is frozen.
Cases (input -> expected):
 0a: `npm run build`, `npm run lint`, `npm test` pass on Node 22. NestJS 11, TypeScript strict, Prisma + PostgreSQL 16, Redis + BullMQ.
     Global prefix /v1. GET /v1/health -> 200 {status, db, redis, version}. Every error leaves as {error:{code,message,fields?,requestId}}
     (unknown route 404, bad body 422 with fields, thrown error 500 with no stack); every response carries x-request-id. Shared kernel in
     src/common: UUIDv7 ids, Money (integer kobo, NGN) with no float anywhere, ISO-8601 UTC time and date-only, E.164 phone and email and
     handle normalisers per conventions.md (each with a test giving a non-canonical input), cursor pagination {items,nextCursor}, auth
     guard shells (public, user, role, staff role, webhook signature, internal) that later modules fill, env loaded and validated at boot
     from a schema that matches .pipeline/env-manifest.json (boot fails naming the missing variable).
     Ports with a stand-in each, chosen by env, never a real call in tests: payments (Paystack), email (Resend), storage (one S3-style
     port; adapters r2 and spaces differ only by config), ai (Anthropic), upload screening, clock (so tests move time), id and code generators.
 0b: `scripts/stack.sh up <prefix> <port>` starts local PostgreSQL and Redis if down, makes <prefix>_test from a migrated template database,
     starts the API on <port> with stand-ins, prints the base URL and PIDs to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/stacks/<prefix>.env; `down <prefix>` stops by PID and drops
     the database. Two stacks at once do not collide. `npm run test:affected -- <paths>` runs only those specs against a fresh database.
 0c: .github/workflows/ci.yml: on every push, Postgres and Redis services, install, lint, typecheck, migrate, the full suite. A gate
     script `scripts/gates.sh` (exit code): no float money (parseFloat/toFixed on amounts), no deferral phrasing in src (out of scope,
     this wave, belongs to, not readable here, later module, TODO), no real provider host in tests. README.md: how to run, in plain words.
Files: anything under /home/user/Firstwish-API except .pipeline/**, build/**, docs/**, tools/**. Out of scope: deployment files for
DigitalOcean (later task), any resource module.
Work: local branch `api-0` from claude/sleepy-mayer-f0hkb8; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-api-0; ports 4010-4019; database prefix api0.
Checks (quiet logs, EXIT lines): build, lint, test, gates.sh, and `stack.sh up api0 4010` then curl /v1/health and an unknown route, then down.
Commit (do not push). Hand back in 10 lines: head sha; per task done or partial with proof; CLAIMS one per line, testable; versions
chosen (and why, one line); what did not run; EXIT lines.
