# Framework profiles & resolution

## § Resolution (deterministic waterfall: run in Phase 0, Step 1)

Evaluate rungs in order; the first decisive rung wins. Record rung + evidence in `.pipeline/framework-decision.json`. One user confirmation, then frozen.

1. **Explicit directive.** The user named a backend framework in this session, project instructions, CLAUDE.md, or repo docs. Highest authority. Evidence: quote the directive.
2. **Sibling evidence.** The workspace/org contains other backend services for the same product family. Detect via manifests: `package.json` deps (`@nestjs/core`, `express`, `fastify`), `composer.json` (`laravel/framework`), `requirements.txt`/`pyproject.toml` (`django`, `fastapi`), `Gemfile` (`rails`), `go.mod`. If all siblings agree → that framework (fleet consistency beats preference). If siblings disagree → present the split to the user as a question, do not pick. Evidence: manifest paths.
3. **Ecosystem constraints.** Deployment target restrictions, mandatory SDKs only available in one language, stated team-language constraints. Evidence: the constraint and its source.
4. **Frontend-adjacency default** (no signals at all):
   - TypeScript-ecosystem frontend (Next.js, React, React Native) → **NestJS** (shared language, shared types package is native).
   - Flutter frontend → **NestJS** (no language adjacency exists; strong typing + module isolation suits the per-resource agent fence best).
   - Rung-4 decisions are explicitly flagged low-confidence in the decision file; the user confirmation matters most here.

**HALT** instead of deciding if: siblings disagree, a directive conflicts with sibling evidence, or mid-run evidence contradicts the frozen decision.

## § What every profile must define

Whichever framework is resolved, `conventions.md` must pin these using the profile below (or, for an unlisted framework, by asking the user to confirm equivalents):
module layout • request validation mechanism • auth check idiom • role enforcement idiom • error envelope production point • ORM + migration tool • test runner + contract-test pattern • the "single registration entry" a build agent is allowed to touch outside its module.

## § NestJS profile

- **Layout**: `src/<resource>/` per resource: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `tests/<resource>.contract.spec.ts`. Shared: `src/common/` (guards, decorators, filters, shared dto), owned by schema/pre-step agents only.
- **Validation**: class-validator + class-transformer DTOs; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, which rejects contract-violating payloads automatically.
- **Auth**: `@nestjs/passport` + JWT access/refresh; `Authorization: Bearer`; refresh at `POST /auth/refresh`.
- **Roles**: `@Roles(...)` decorator + `RolesGuard` from the conventions role matrix.
- **Errors**: one global exception filter producing the envelope; agents never hand-roll error shapes.
- **ORM default to confirm**: Prisma (schema-first fits the registry well); TypeORM acceptable.
- **Testing**: Jest + supertest against a Nest testing module, fresh test DB; assert shapes (key presence + types), not snapshots.
- **Registration entry**: one import line in `app.module.ts`.

## § Laravel profile

- **Layout**: per resource: `app/Http/Controllers/<Resource>Controller.php`, `app/Services/<Resource>Service.php`, `app/Http/Requests/<Resource>/*.php` (FormRequests), `app/Http/Resources/<Resource>Resource.php`, `app/Models/<Resource>.php`, `tests/Feature/<Resource>ContractTest.php`. Shared: middleware, base FormRequest, exception handler, pre-step/schema agents only.
- **Validation**: FormRequest classes per endpoint; `rules()` mirror the contract exactly.
- **Auth**: Sanctum (default to confirm) or Passport; `Authorization: Bearer`.
- **Roles**: middleware (e.g. `role:owner,staff`) or policies per the role matrix; pick one in conventions and use it uniformly.
- **Errors**: envelope produced in `bootstrap/app.php` exception handling (or `Handler.php` on older versions); one place only.
- **ORM**: Eloquent + Laravel migrations (native).
- **Testing**: PHPUnit/Pest feature tests with `RefreshDatabase`; assert JSON structure + types against the contract.
- **Registration entry**: route group in `routes/api.php` (one block per resource).

## § Express/Fastify profile (minimal: confirm details with user)

- **Layout**: `src/<resource>/`: router, service, `schemas/` (zod or JSON Schema), `tests/`. Shared: `src/middleware/`, error handler, pre-step only.
- **Validation**: zod (Express) or Fastify's native JSON Schema; parse at the route boundary, contract shapes = schemas.
- **Auth/roles**: JWT middleware + role middleware from the matrix.
- **Errors**: single error-handling middleware producing the envelope.
- **ORM to confirm**: Prisma default.
- **Testing**: vitest/jest + supertest (Express) or `fastify.inject` (Fastify).
- **Registration entry**: one `app.use('/resource', router)` / `fastify.register` line.

## § Other frameworks (Django, Rails, FastAPI, Go…)

Resolved via rungs 1–3 only (never a rung-4 default). Before Phase 1, draft the profile (the eight items in § What every profile must define) from the framework's standard conventions, confirm it with the user, and append it to `conventions.md`. The agent-prompt templates apply unchanged; they reference the profile, not a framework.
