---
name: contract-driven-backend
description: Build a complete backend from an existing frontend (Flutter, Next.js, React, or any stack) using a fleet of strictly-scoped sub-agents (one agent, one feature, one context). The backend framework is resolved deterministically from project signals (user directive, sibling services, team conventions), never assumed. Use this skill whenever the user wants to generate a backend from a frontend, wire a mock-data frontend to a real API, extract API contracts from screens, "build the backend layer", "swarm agents on the backend", or replace mock repositories with live endpoints. Also trigger when the user mentions contract extraction, contract registry, dependency waves, or one-agent-one-feature backend builds. Do NOT freestyle a backend from full-app context. That is exactly the failure mode this skill exists to prevent.
---

# Contract-Driven Backend Pipeline

Generate a backend from an existing frontend using parallel sub-agents that each own exactly one scope. The pipeline exists because giving one agent (or one reasoning orchestrator) the whole app reliably produces divergent contracts, inconsistent shapes, and cross-file drift.

## Core laws (never violate these)

Phase 0 installs `verification-harness` if installed (this skill does not ship it); it
runs at every phase boundary (Phase 3 freeze, Phase 5 wave gate, Phase 7 smoke, Phase 8
live gate). Without it the minimum gate is: typecheck, lint and the affected specs run as
`(cmd; echo "EXIT $?") > log 2>&1` and gated on the log's last line being `EXIT 0`; a grep
for the deferral phrasings of law 11 over the diff; the FAIL lines compared line by line
with the base branch's (law 16); and the separate verifier of law 17 on every T1 and T2
bundle. `qa-audit` is the final sweep if installed, otherwise a fresh verifier agent runs
the Verify brief across the whole surface.
Every law below was written down correctly before and ignored once by a model 200k tokens into a build that wanted to finish. A law that is not an exit code is not a law; the prose explains *why*, but where a gate exists, the gate holds.

1. **One agent, one scope.** Every sub-agent is pinned to one screen (extraction/wiring) or one bundle of 1 to 5 resources of one wave (build), each resource keeping its own module fence. It never touches files outside its scope.
2. **Coordination lives in artifacts, not agents.** No agent "decides" how pieces fit together. Fit is defined by frozen JSON artifacts in `.pipeline/`. You (the main session) act as a **dispatcher**: read artifacts, spawn agents, collect outputs, enforce scope. You never make design decisions on behalf of agents mid-flight.
3. **The registry is frozen once written.** After Phase 3, `registry.json` is read-only truth. If an agent discovers the registry is wrong, it HALTS and reports; it never edits the registry or improvises around it.
4. **Reconciliation is mechanical.** Merge, dedupe, collision-detect, halt-on-conflict. Conflicts go to the user, not to model judgment.
5. **Slicing unit changes at reconciliation.** Extraction is sliced *by screen*. Build is sliced *by resource*. Reconciliation converts screen-slices into resource-slices; that is its entire job.
6. **Verification gates every build.** An agent is not "done" when code compiles; it is done when its affected contract tests pass AND, for T1 and T2, a separate verifier returns `merge` (law 17); a T0 task is accepted on the lead's diff read.
7. **Framework is resolved deterministically, once, with evidence; never assumed and never switched mid-run.** Run the resolution waterfall in `references/framework-profiles.md`, record the outcome + evidence in `.pipeline/framework-decision.json`, get one user confirmation, then it is frozen like the registry.
8. **Evidence has four sources, one pipeline.** Screens (what is), product truths (what should be), design sources (what the UI was specified to do, including its non-happy states), and recorded decisions (what was chosen when they disagree). All enter reconciliation as provenance-tagged inputs through the same mechanical pass; nothing is conflict-exempt. Priority when they collide on target state: recorded decision (Supersedes/ruling) > product truths > design sources > screen evidence. Screen evidence remains authoritative for as-built shapes; anything overriding it must exist as a written Supersedes entry, never as silent judgment. **This priority order does not extend to facts a design source has no authority over**: money amounts, fees, rates, limits, legal document sets, statutory text, third-party branding. A design is authoritative for structure, flow and copy tone, never for what something costs or what the law requires; those come from the owner or config. Where a design source asserts one of these and another source (screens, product truths, the live system) disagrees, that is a `conflicts.json` HALT, not a priority resolution: get an explicit ruling before adopting either side. (Observed: a canvas drew transaction fees about four times cheaper than the backend charged.)
9. **Green in isolation is not green.** Per-side gates (frontend tests against fakes + backend tests against fixtures) prove nothing about the seam between them, which is where format mismatches, missing reads, auth-handshake breaks and CORS live. The pipeline is NOT done until the real frontend runs against the real backend, authenticates the real way, and a seeded server datum is *observed rendering* (Phase 8). "Compiles and calls the API" is not done; "both suites pass" is not done.
10. **Coded is not reachable.** Every state and code path the pipeline creates or preserves must have a runtime trigger that fires with no human intervention. A hardcoded signal (`online = true`), a "real impl later" comment, a sync function whose only caller is a manual button, or a designed state with no way to enter it; each is an OPEN TASK in an artifact, never an implementation detail. If the pipeline observed it, the pipeline owes a resolution for it. **Every state also needs an EXIT**: a status a record can enter and never leave is a dead end that looks like working code until a real user is stuck in it.
11. **A scope declaration is a stub.** Any agent output or code comment that names a gap and defers it ("out of scope for this module", "the write path belongs to X", "this wave only exposes the read", "REAL but not readable here", "belongs to whichever resource owns those events") is a `stubs.json` entry with a required resolution, exactly like a TODO. This is the highest-yield law here: THREE of the worst shipped defects in one build were identified in a comment **by the very agent that created them**, and shipped anyway. Noticing a gap is the system working; leaving it as prose is the system failing. **Grep for the deferral phrasings** (`out of scope`, `this wave`, `belongs to`, `not readable here`, `later module`, `owns those events`); do not rely on noticing them.
12. **Sold is built.** Every entitlement named in a pricing table, plan description or `product-truths.json` must map to a reachable, tested code path before the pipeline reports done. Reconciliation emits `entitlements.json` mechanically from those tables; each entry names the endpoint(s) that deliver it and the test that proves it. An entitlement with no endpoint is not a gap to log, the product is *charging* for it. (Observed: community hosting sold on both pricing cards, with no create endpoint in the backend.)
13. **Every field has a writer and at least one reader, traced end to end.** Reconciliation emits `field-flow.json`: per field, who writes it, where it is stored, and every surface that reads it. A field written by one actor and read by another MUST be observed crossing that boundary in Phase 8. A reader that hardcodes a value the store already holds is a defect, not a placeholder. (Observed: a DM price no buyer-facing endpoint ever selected, so every creator read as "messages off", with both suites green.)
14. **A displayed metric has a writer, a definition, and an explanation.** Any number rendered to a user needs all three: an event path that actually updates it, a definition with its formula in the product docs, and user-facing copy saying what it means. A metric whose only writer is the seed script is a fake; cut it or complete it. (Observed: a creator "EVG score" on four surfaces, written by nothing, its acronym expanded only in a backend code comment.)
15. **Never let a model be the gate.** Gates are executable: tests, migrations, HTTP status codes, rendered output. A model's review, judgement or self-report only finds candidate problems (judges flip with option order and prefer their own output); something deterministic decides. A verifier's `merge` rests on attacks it ran and output it shows, never on its opinion.
16. **A red or non-deterministic suite is a halt, not a background annoyance.** Halt on any failure the branch adds. A suite already red on the base branch is baselined (name, owner, reason) and the branch passes when its FAIL lines equal the base's, line by line (a count can hide a swap); a pre-existing failure users hit becomes its own small task. A failing test everyone works around stops being a signal, and the next real regression hides behind it. Order-dependence is the same defect: specs own their fixtures and restore whatever they mutate. (Observed: 13 tests red long enough that two agents routed around them, one masking a live two-service divergence; a teardown that never returned a claimed upload slot, so a counter ratcheted up on every run.)
17. **Nothing certifies its own work.** An agent that built a resource is disqualified from being the evidence that it works, even when its self-report is honest: the incentive to see completion runs the same way as the effort just spent. Every T1 and T2 bundle gets a separate verifier (`references/agent-prompts.md` § Verify: lean for T1, full with the money attacks for T2) before merge; T0 gets the lead's diff read. The builder's claims are tested, not trusted. `qa-audit` if installed (full coverage from a source outside the code, findings only) stays as the final sweep, not the only check. (Observed: 188 screenshots and a per-screen "matches" claim, all made by the agent that wrote the screen; an independent look found ten defects in an hour. Verifiers caught 2 blockers that green contract tests missed: two deletes at once freed extra places, and erasing an account kept its phone verified.)

## Tiers and bundles

Run the fleet per build-orchestration's tiers. The tier is set when the task is cut and is the brief's first line:
- **T0 lean** (copy, records, config, test-only, generated files): one run, ~25 steps, affected tests and typecheck, no verifier agent (the lead reads the diff), no rounds.
- **T1 plain** (endpoints and screens with no money or identity, removals, sweeps): one builder per bundle, ~90 steps (+30 per extra task); lean verifier ~35 (+10); pictures for screens only, one light/dark pair.
- **T2 money and identity** (money paths, auth, KYC, deletes, migrations on money tables, third parties): builder ~130 (+40); full verifier ~90 (+20) with the money attacks, every drawn state of a pay screen, a local stack.
- **Bundle**: 2 to 5 tasks of one area and repo pair, one brief, one branch, one verifier. Never mix T0 upward.
- **Checks**: agents run only the affected tests, typecheck and lint on changed files, to quiet logs gated on the EXIT line. The full suite runs in CI on every push. Agents never wait on or poll CI: push, hand back with head shas; the lead (or a no-model watcher script) reads the run once and sends the agent back only if red.
- **Rounds**: blocker, high and medium get a round; low goes to `sweep.md`. At most 2, then the lead rules (accept with a sweep row) or re-cuts. A fix of 30 lines or fewer closing named findings may be accepted on the lead's diff read.
- **Batches**: merge at 6 checked tasks or 6 hours, money first, one PR at a time.

## Pipeline artifacts

All pipeline state lives in `.pipeline/` at the repo root (add to `.gitignore` or commit; user's choice, ask once):

```
.pipeline/
├── framework-decision.json  # Phase 0: resolved framework + evidence trail. FROZEN after confirmation.
├── product-truths.json   # Phase 0: cross-cutting target-state truths (from doc or interview), with provenance
├── conventions.md        # Phase 0: auth model, roles, error envelope, pagination, naming
├── declared/             # Phase 0: declaration fragments for backend-only surfaces (sourceScreens: [])
│   └── <resource>.json
├── supersedes.json       # Phase 0+: user-approved overrides of as-built evidence. Append-only, audited.
├── scan-map.json         # Phase 1: frontend stack, screens + data provenance, persistence flags
├── fragments/            # Phase 2: one contract fragment per screen
│   └── <screen>.json
├── registry.json         # Phase 3: canonical contracts, FROZEN after approval
├── dep-graph.json        # Phase 3: resource dependency graph → build waves
├── conflicts.json        # Phase 3: unresolved conflicts (must be empty to proceed)
├── ui-align-tasks.json   # Phase 3: the ONE Phase-6 work queue, derived mechanically from
│                        #   supersedes/rulings + stubs + missing designed states
├── stubs.json           # Phase 1/2: every placeholder, hardcoded signal, "real impl later".
│                        #   Each MUST end resolved: implemented | deferred-by-user | not-a-stub
├── entitlements.json     # Phase 3: every sold/advertised entitlement → delivering endpoint(s) + proving test (law 12)
├── field-flow.json       # Phase 3: per field: writer(s), store, every reader. Cross-actor edges flagged (law 13)
├── metrics.json          # Phase 3: every displayed metric → its writer path, formula, user-facing explanation (law 14)
├── decisions.json        # Any phase: autonomous rulings made on the user's behalf, with confidence (see Autonomous mode)
├── sweep.md              # Phase 5+: low-severity findings, drained in one sweep, never a fix round
├── env-manifest.json     # Accumulated: every env var/secret any agent introduces (deploy checklist)
├── live-gate.md          # Phase 8: end-to-end evidence: what was observed rendering, + screenshots
├── REVIEW.md             # Final: the morning briefing for an unattended run; low/medium-confidence calls first
└── status.json           # Dispatcher state: phase, completed agents, failed agents
```

JSON schemas for every artifact: read `references/schemas.md` before Phase 1.

## Phase 0: Product truths, framework, conventions (with the user, once)

**Step 0: Product truths.** First question of the entire pipeline: *"Is there a product document, strategy PDF, Notion spec, pitch deck, PRD? Give me the path(s)."*

- **Doc exists** → spawn one doc-digest agent (template: § DocDigest) to extract cross-cutting target-state truths into `product-truths.json`: pricing/entitlement philosophy, what is core vs paid, lifecycle rules, defined metrics/formulas, non-obvious invariants. Each truth cites its location in the doc. The doc is the tiebreaker between interview answers and screen evidence; a convention that contradicts a truth must be flagged, not silently written.
- **No doc** → do NOT stall or skip. Run the same truth-extraction as interview questions (entitlement philosophy, core-vs-paid boundaries, lifecycle rules, key metrics) and write `product-truths.json` with provenance `interview`. It plays the identical downstream role; absence of a doc changes the source, never the artifact.

**Step 1: Resolve the framework deterministically.** Run the waterfall in `references/framework-profiles.md` § Resolution:

1. **Explicit directive**: the user named a framework in this session or in project instructions (CLAUDE.md, repo docs). Highest authority; stop here.
2. **Sibling evidence**: the workspace/org has existing backend services for this product family. Detect their stack from lockfiles/manifests. Consistency with a live fleet beats greenfield preference; stop here if unambiguous.
3. **Ecosystem constraints**: deployment target, required SDKs, or team-language constraints that exclude candidates.
4. **Frontend-adjacency default**: no signals at all: apply the default table in framework-profiles (e.g. TypeScript-ecosystem frontend → NestJS).

Write `.pipeline/framework-decision.json`: chosen framework, which waterfall rung decided it, and the evidence. One user confirmation, then frozen: mid-run contradicting evidence is a HALT, never a switch.

**Step 2: Conventions.** Cross-cutting concerns belong to no screen. Interview the user (with `product-truths.json` in hand, prefill answers from it and cite), then write `conventions.md`. Required sections:

- **Auth model**: JWT/session, token refresh flow, where tokens live in requests.
- **Roles & permissions**: full role matrix if the app is multi-role (who can hit what).
- **Error envelope**: one canonical error response shape for the entire API.
- **Pagination convention**: cursor or offset, parameter names, response wrapper.
- **Naming & layout**: route casing, module layout; prefill from the resolved framework's profile; confirm or override with the user.
- **ORM / database**: prefill from the framework profile's default; confirm; never silently assume.
- **File uploads, websockets, push**: list any non-REST surfaces now so they aren't discovered mid-build.
- **Identity & format canon** (prevents the whole client/server format-mismatch class): for every value that identifies or measures (phone, email, external ids, money, timestamps, ids), write ONE canonical wire format and state that **the server normalizes on ingest** rather than trusting the client (e.g. phone → E.164 `+234…`, normalized server-side and matched tolerantly against legacy forms; money → integer minor units; time → ISO-8601 UTC; id → UUIDv7 string). A phone number that is also an account key is not a string field; it is an identity, and two spellings of it are two accounts.
- **Runtime contract** (the app's living behavior, which no single screen owns): the **connectivity source** (which package/probe tells the app it is offline; name it, or record "none, always-online" as an explicit decision); **sync/refresh triggers** (which of: app launch, post-login, app-resume, connectivity-regain, periodic; a manual button is NOT a trigger); and the **required UI states** every data surface must implement (loading / empty / error / offline) and where each is shown. Phases 6 and 8 gate against this section.

**Step 3: Backend-only surfaces (declared resources).** Ask explicitly: *"What does the backend need that no screen shows?"*, then probe the standard invisible categories rather than waiting for recall:

- **Third-party integrations**: payments, SMS, email, push, storage. For each: provider, direction (outbound calls / **inbound webhooks**: webhooks are endpoints with signature-verification auth, no user role), env vars for credentials (→ `env-manifest.json`), sandbox availability for tests.
- **Scheduled/background work**: reminder engines, reconciliation jobs, digest emails: schedulers and queues are resources with contracts even though no screen calls them.
- **Ledgers and derived data**: credit ledgers, audit trails, analytics/insights aggregation, risk scoring.
- **Reference/seed data**: bank lists, country lists; declare the source (e.g. provider API vs static seed).
- **Offline sync** (mandatory question if Phase 1 flags local persistence; see Phase 1): sync strategy, delta endpoints, conflict-resolution policy, tombstones, and, stated explicitly, not implied, **which triggers fire push and pull** (launch, post-login, resume, connectivity-regain, periodic). An offline-first app whose sync has no automatic trigger is a local-only app: the user logs into a populated account and sees an empty screen. This is usually the largest zero-screen-evidence surface in an offline-first app.

Each becomes a declaration fragment in `.pipeline/declared/<resource>.json`: same fragment schema as screen extraction, `sourceScreens: []`, provenance `declaration`. Declarations enter reconciliation as ordinary fragments: **they are NOT conflict-exempt.** A declared ledger can contradict a screen's rendering of the same data, and that conflict must surface like any other.

**Step 4: Supersedes.** Ask: *"Where is the frontend as-built already wrong versus target state?"* (units, ID strategy, auth method, plan literals…). Each override is one entry in `supersedes.json`: the as-built evidence, the target state, the reason, and user approval. Reconciliation consumes these mechanically, a superseded pattern is transformed instead of raised as a conflict, and the audit trail shows who overrode what and why. Supersedes can also be appended later whenever reconciliation surfaces a conflict the user resolves by "the frontend is stale", same file, same shape. **Record every ruling in the owner's exact words, with who and when, and say what it covers and what it does not. A phrase that reads two ways is asked, not chosen** ("other parts of the site should not show" was read as hiding the landing page too).

Every sub-agent in every later phase receives `conventions.md` and the relevant truths as read-only context. Do not proceed until the user has confirmed the framework decision, conventions, declarations, and supersedes list.

## Phase 1: Detect (1 agent)

Spawn one agent to inspect the frontend repo and emit `scan-map.json`. It identifies:

- Frontend stack (Flutter / Next.js / React / other) and where the data layer lives (mock repositories, fetch hooks, server actions, service stubs, state models).
- The screen/route inventory: every screen or page, its source files, and its data-layer files.
- **Per-screen data provenance**: how each screen actually gets its data. The seam split is load-bearing: wiring a repository that reads a LOCAL STORE does not put server data on screen unless something also *populates* that store.
  - `repository-direct`: seam whose read will itself call the API once wired (service/hook/mock repo returning fetched data). Standard wiring applies and is sufficient.
  - `repository-local-store`: seam that reads an on-device DB/cache (drift, Room, Hive, IndexedDB…). Wiring the seam is NOT enough: this screen needs a **populate path** (a pull/sync that writes the store) plus a trigger, or it will render local data forever and look fine while being blind to the backend.
  - `inline`: data hardcoded inside UI files (literal lists in widgets/components); no seam exists.
  - `mixed`: some via seam, some hardcoded.
  - `static`: content plausibly meant to stay local (country lists, onboarding copy); flagged for a human ruling: keep local vs serve from backend.
- **Local persistence flag**: any on-device database or cache (drift/sqflite/hive/Isar, IndexedDB/localStorage-as-store, WatermelonDB). If present, the app is presumed offline-first, every screen reading it is `repository-local-store`, and the Phase 0 sync question becomes MANDATORY (loop back to Step 3 if Phase 0 already ran without it).
- **Seed / demo-data sources**: any file that populates the local store or mocks with realistic-looking data (`seed.dart`, fixtures, factories), **and how it is gated** (build flag, debug-only, always-on). Record it: seeded data flowing through the real read path is what makes a disconnected app look connected, and it is the single hardest thing for a human to distinguish by eye.
- **Stub signals** → `stubs.json`: hardcoded state that stands in for a real source (`ValueNotifier(true)`, `isOnline => true`), comments of the form "real impl / TODO / stub / mock later", providers wired to fakes, and feature toggles with no backing. Each becomes a tracked stub with a required resolution. Grep for the comment patterns; do not rely on noticing them.
- **Design sources**: any design artifact in or beside the repo; exported canvases (HTML/Figma exports), screenshots, a design-system folder, style tokens. Record paths and, where machine-readable, the **frame/state names** they define (e.g. "Dashboard · Loading", "Dashboard · Offline", "Backup · syncing"). These are the evidence for designed non-happy states; without this the pipeline only ever sees the happy path the code already implements.
- The mock-data pattern in use, with 1–2 concrete file examples, so extraction agents know exactly what to scan.

This is what makes the skill frontend-agnostic: extraction agents are told *what patterns to look for* by the scan map, not by hardcoded assumptions. Prompt template: `references/agent-prompts.md` § Detect.

Review the scan map yourself. If screens are missing, the data layer wasn't found, or provenance classifications look wrong, fix it with the user before proceeding; every later phase inherits its errors.

## Phase 2: Extract (N agents in parallel, one per screen)

For each screen in `scan-map.json`, spawn one extraction agent. Its entire scope: that screen's files. It emits `fragments/<screen>.json` describing, from that screen's point of view only:

- Data it reads (entities, fields, types as rendered/consumed)
- Actions it fires (create/update/delete/custom, with payload shapes)
- Expected responses (shapes, list vs single, empty/error states the UI handles)
- Realtime/polling/upload needs, auth context assumed, role gates observed in UI
- **State coverage, two lists side by side**: `uiStatesHandled` (states this screen's code can actually enter today) and `uiStatesDesigned` (states the design sources specify for it). The gap between them is not the agent's to fix or excuse; it is reported, and Phase 3 turns each missing state into a task. Also record, for each handled state, **what makes it appear** (the condition), so a state that exists but is unreachable is visible as such.
- **Stubs observed inside this screen's files** → appended to `stubs.json` (same signals as Phase 1). Extraction sees per-screen detail the repo-wide sweep misses.

Extraction agents describe **what the screen needs**; they do not invent endpoints, routes, or backend design. Naming endpoints is reconciliation's job. Prompt template: `references/agent-prompts.md` § Extract.

Extraction agents only read, so spawn them together. Collect fragments; if any agent failed or produced an empty fragment, re-run that one screen before Phase 3.

## Phase 3: Reconcile (mechanical, no reasoning agent)

This phase replaces the failed-orchestrator pattern. Do it as a deterministic pass: write a script where possible, and where model judgment is unavoidable keep it to classification, never invention.

**Inputs**: `fragments/*` (provenance `screen`), `declared/*` (provenance `declaration`), `supersedes.json`, `product-truths.json`.

1. **Apply supersedes first.** Transform matching as-built evidence to target state before any merging (e.g. every naira-float field → kobo-integer). Each application is logged with its supersede id. Unmatched supersede entries (evidence pattern not found) are reported; they may be stale.
2. **Group all fragments by entity**: screen and declaration fragments together. "user profile" seen by 5 screens = one `User` resource; a declared ledger nobody renders = one resource with `sourceScreens: []`.
3. **Merge field sets.** Union of fields across sources, types unified. Same field, different type → `conflicts.json`; regardless of whether the disagreement is screen-vs-screen or screen-vs-declaration. Declarations are not conflict-exempt.
4. **Check against product truths.** Any derived contract that contradicts a truth (e.g. an entitlement gate on a feature the truths say is core in all tiers) → `conflicts.json` with the truth citation.
5. **Derive endpoints per resource** from the union of actions, applying `conventions.md` naming. Webhook-receiving resources get inbound endpoints with signature-verification auth noted (no user role).
6. **Detect collisions**: same conceptual field with different names, same action with different payloads, role-gate contradictions.
7. **Emit `ui-align-tasks.json` mechanically, from FOUR sources, not one.** This is the single Phase-6 work queue; every entry is derived, never remembered:
   - `kind: "supersede"`: every supersede/ruling whose target state changes something a screen displays or sends (units, auth method, literals) → the affected screen, named files, exact change.
   - `kind: "designed-state"`: every state in a fragment's `uiStatesDesigned` missing from its `uiStatesHandled`, one task per screen per state. This is how designed loading/offline/error states stop evaporating: the pipeline wires the happy path by nature, so the non-happy states must be *owed* by an artifact.
   - `kind: "stub"`: every unresolved entry in `stubs.json`. A stub is either implemented (task) or explicitly deferred by the user (recorded, with the consequence named); silence is not a resolution.
   - `kind: "populate-path"`: every `repository-local-store` screen, asserting a pull/sync writes the store it reads AND naming the trigger from the conventions Runtime contract. Wiring alone cannot satisfy this; the task exists so the gap is impossible to miss.
8. **Format-canon check.** Any field appearing in more than one resource whose type is format-sensitive (phone, email, money, timestamp, id) must match the Identity & format canon in `conventions.md`; a field with no canon entry, or two resources disagreeing on its format → `conflicts.json`. Two spellings of an identity are two accounts: catch it here, not in production.
9. **Output**: `registry.json` (canonical resources + endpoints + shapes, each field carrying provenance and any supersede annotations wiring agents must honor: e.g. "wire format kobo; UI displays naira until align-task-3 lands"), `dep-graph.json` (waves via topological sort), `conflicts.json`, `ui-align-tasks.json`.

**HALT CONDITION**: if `conflicts.json` is non-empty, stop. Present each conflict with its disagreeing sources. The user resolves: either by picking a side (recorded as a ruling) or by declaring the frontend stale (appended to `supersedes.json`); then re-run reconciliation. Never auto-resolve.

When conflicts are empty, present the registry summary (resources, endpoint count, waves) to the user for approval. On approval, the registry is **frozen**.

## Phase 4: Schema & migrations (1 agent)

Single agent, whole-schema scope (this is the one deliberately global step: foreign keys and relations cannot be parallelized). Input: `registry.json`, `dep-graph.json`, `conventions.md`. Output: ORM schema + migrations + shared types/DTO package that build agents import instead of re-declaring. Prompt template: `references/agent-prompts.md` § Schema.

Gate: migrations run clean on a fresh database before Phase 5.

**Test kit (once, before Phase 5).** Build a database template, provider stand-ins, an identity stand-in, a build script and a ports table. Agents get the kit; none hand-builds its own stack (hand-built stacks cost 6% of one build's spend, plus rebuilds after setup mistakes).

## Phase 5: Build in waves (one agent per bundle)

Read waves from `dep-graph.json`. For each wave, run one builder per bundle of that wave's resources, capped by the machine budget (§ Dispatcher rules); the rest queue. Wait for the wave to pass before starting the next.

Each build agent receives: its bundle's resource contracts from the registry, `conventions.md`, the shared types package, and the file paths of already-built modules it may import (interfaces only; it never edits them). It produces: one feature module in the resolved framework's idiom (route handlers, service layer, validated request/response shapes, role enforcement, per the framework profile) **plus contract tests** generated from its contract (request shape in → status + response shape asserted, including auth/role rejection cases).

**Gate per bundle**: its affected contract tests pass AND, per tier, an independent verifier returns `merge` (§ Verify) or the lead reads the diff (T0). The builder never verifies. A build that fails its tests gets one re-run with its failure output; a second failure HALTs. **Severity decides fix rounds** (§ Tiers and bundles); lows go to `.pipeline/sweep.md`, never a new round. Prompt templates: `references/agent-prompts.md` § Build and § Verify.

**Contract tests must not grade their own homework on format.** A test that writes a fixture and reads it back in the same spelling can never catch a client that spells it differently; that class of bug is structurally invisible to a self-consistent suite. So: for every identity/format-sensitive field, assert the canon from `conventions.md` explicitly, and include at least one **non-canonical input** case proving the server normalizes it (e.g. local-format phone `08031472093` must resolve to the same account as `+2348031472093`). Where a shared fixture generated from the real client's serialization is available, prefer it over hand-written payloads.

Scope enforcement: a build agent may only create/edit files inside its own module directory. If it believes it needs to change shared code or another module, it HALTS and reports; that's a registry or schema problem, not its problem. Integration-adapter resources (payment, SMS, email providers) follow the same rules; one adapter, one agent, secrets via env vars appended to `env-manifest.json`, external calls behind an interface so contract tests can stub them; webhook endpoints verify provider signatures per the registry annotation.

## Phase 6: Wire the frontend (one agent per screen, or per bundle of screens sharing a pattern)

Same discipline as extraction, opposite direction. Agents that render or build are capped by the machine budget (§ Dispatcher rules). Gate per bundle: the done-evidence below AND, per tier, a separate verifier's `merge`. A part of a screen whose backing resource is not built is not drawn (no do-nothing control, no placeholder row); the task that builds the backing adds it. The scan map's per-screen data provenance selects the variant; all variants read the same frozen registry and must preserve working loading/error/empty states.

- **Standard wiring** (`repository-direct` screens): replace the mock data layer with real API calls. Scope: that screen's data-layer files only: UI files untouched. Honor registry supersede annotations (e.g. convert kobo wire format to the display the UI expects, until its align task lands).
- **Populate-path wiring** (`repository-local-store` screens): the screen reads a local store, so wiring the seam alone changes nothing on screen. This agent must (1) wire the pull that writes the store from the API, and (2) verify a **trigger** from the conventions Runtime contract actually invokes it: launch, post-login, resume, connectivity-regain or periodic. A manual "sync now" button is not a trigger and does not close this task. **Done = a fresh store, populated from the backend, rendering.**
- **Seam introduction** (`inline`/`mixed` screens): the screen hardcodes data inside UI files, so a seam must be created before wiring is possible. Scope: that screen's data-layer location **plus the named UI files carrying the hardcoded data, for extraction only**. Two steps in one agent: (1) lift the hardcoded data into a proper data-layer seam matching the repo's pattern, UI consuming the seam with zero visual/behavioral change; (2) wire the seam to the API. The agent may not restyle, restructure, or "improve" UI beyond replacing literals with seam reads.
- **UI alignment** (tasks from `ui-align-tasks.json`, all four kinds): one agent per task, scoped to exactly the files the task names, making exactly the change the task defines: a supersede (naira literals → formatted kobo), a **designed-state** task (implement the designed offline/loading/error state and the condition that enters it), a **stub** task (replace the hardcoded signal with the real source named in the Runtime contract), or a **populate-path** task. Runs after wiring of that screen, since alignment often depends on the new seam.
- **Static-ruled screens**: data ruled "keep local" is left alone and recorded; ruled "serve" becomes standard/seam wiring against its registry resource.

Pre-step (single agent, once): the shared API client: base URL config, auth header injection, token refresh, error envelope parsing, and any sync engine scaffold the conventions define for offline-first apps. **The sync scaffold ships with its triggers wired, not just its functions written**; a sync engine with no automatic caller is an unshipped feature, and the pre-step is not done until launch/login/resume (per the Runtime contract) actually invoke it.

**Phase-6 exit checklist** (dispatcher-run, before Phase 7; all mechanical, all from artifacts):
1. Every `ui-align-tasks.json` entry is `done` or `deferred-by-user`. No silent skips.
2. Every `stubs.json` entry is resolved (`implemented` | `deferred-by-user` | `not-a-stub`).
3. Every `repository-local-store` screen has a populate path AND a named non-manual trigger.
4. The connectivity source named in the Runtime contract exists as a real dependency, not a hardcoded constant. If the decision was "none, always-online", the offline states are formally deferred, not silently dead.

## Phase 7: API smoke pass (1 agent)

Boot the backend, run migrations + seed, hit **every endpoint in the registry** with valid auth per role, including declared resources' endpoints and webhook endpoints (simulated signed payloads): assert status codes and response shapes against the registry. Verify `env-manifest.json` is complete: every env var any module reads is listed. Produce a pass/fail table. Any failure names the resource and the contract clause violated → re-dispatch only that resource's build agent.

**This proves the backend is correct with itself. It proves nothing about the app.** Minted tokens skip the login handshake, server-side fixtures skip the client's serialization, and no browser or device is involved, so auth-handshake breaks, format mismatches, CORS and missing reads all survive a green Phase 7. That is what Phase 8 is for; Phase 7 alone is never "done".

**The deploy's own test job (full suite, contract specs, inventory specs for routes, rate limits and money fields) runs in CI on the branch on every push, before merge, not after; the lead reads that run once.** Three deploys were stopped after merge by exactly these, each costing a hotfix and blocking other merges.

## Phase 8: Live end-to-end gate (1 agent + human eyes, MANDATORY)

The only phase that exercises the seam. Boot the **real backend** (migrated, seeded with a known tenant) and run the **real frontend build** against it: a device/emulator via the platform's integration-test driver (`integration_test`/`flutter drive`, Detox, XCUITest) for native apps; a production build driven headless (Playwright or equivalent) for web. Then assert, in this order:

1. **Real auth handshake.** Log in exactly as a user does: the actual OTP/password/SSO flow over HTTP. **No minted tokens, no injected session.** This is the step that catches identity-format mismatches, normalization gaps and broken refresh.
2. **A seeded server datum is observed rendering.** For every primary read surface: a value that exists ONLY on the server (never in local seed or fixtures) must be visible in rendered output. Choose distinctive seeded values so "server data" cannot be confused with "local data". Fresh install + login must not land on an empty screen. Write every Phase 8 assertion as a **capability**, never an absence: "a user can place a buy order and is asked for their passcode," not "the orders screen renders" and never "no error view is present on any surface." Absence of an error is not evidence of anything: a live gate that asserted only that once passed while a sign-up field was dead and a money-moving transaction asked for no PIN.
3. **Local-store screens are populated by sync, not by seed.** For `repository-local-store` surfaces: start from a *clean* store, perform only the real user actions (launch, log in, wait), and assert server data appears with no manual sync tap.
4. **Designed runtime states actually enter.** Drive the condition and observe the state: cut the network → the offline indicator appears; cold-start with a slow/blocked API → the loading state appears; error response → the error state appears. A state that cannot be entered under its own condition FAILS, regardless of the code existing.
5. **Write path round-trips.** Create something in the app, then confirm it via the API (or a second client), proving the client's serialization is what the server actually accepts.
6. **No demo data in a production-shaped build.** Build with production flags and assert the seed/demo source recorded in Phase 1 does not execute; grep rendered output for the known seed literals.
7. **Screenshot every primary surface** into a review folder. Automated checks catch crashes and emptiness, not wrongness, the screenshots are how the human catches the rest in one scroll.

Record what was observed (not merely "passed") in `live-gate.md`. Any failure names the surface and which assertion broke → re-dispatch only the responsible wiring/build agent. **The pipeline is not complete until Phase 8 is green**: Phases 1–7 green with Phase 8 unrun means the app has never once been proven to talk to its backend.

## Dispatcher rules (you, the main session)

- Maintain `status.json` after every phase and every wave.
- **Set the model on every spawn** (the cheaper one; never leave it to inherit, never resume an agent on a dearer model). The dispatcher orchestrates, merges and waits; it writes no task code. Wait for CI and deploys with a no-model watcher script, never by polling in-session. The lead stops: hand-editing boards (generate them), polling CI, reading full verifier reports (hand-backs carry severities), mid-run messages (a brief that names its defaults needs none).
- **Measure the machine first** (`nproc`, `free -g`, `df -h` on the work and temp folders) and put the figures in every brief. **Spawn read-only agents (detect, extract, classify) freely. Agents that run suites, servers, builds or exports: at most min(CPUs + 1, available GB / 2.5), rounded down, measured at the start, the rest queue**; a heavy job starts only with 5 GB available, and a memory kill is memory, not a code failure (`references/agent-prompts.md` § Machine budget). 4 CPUs and 15 GB held 3 to 6 agents; 9 gave OOM kills, killed test workers, flaky timing tests and re-runs.
- **Briefs are lean**: from templates, 25 lines or fewer: tier, bundle, step budget, file map, exact cases; no rule text or history; the shared rules file is 40 lines or fewer. Hand-backs: builder 10 lines, verifier 20 (severities, not full reports). A brief file is never appended to by later rounds; findings go in a separate small file the next agent reads beside the brief.
- Never write feature code yourself; never resolve conflicts yourself; never edit the frozen registry. Your jobs: interview (Phase 0), review artifacts, spawn, collect, gate, report.
- On resume: read `status.json`, continue from the recorded position; never restart completed phases.
- Build every sub-agent prompt from the templates in `references/agent-prompts.md` (they encode the scope fences); never improvise looser ones.
- **Report completion honestly.** "Phases 1–7 green" is not "the backend is done": say which gates ran and which did not. If Phase 8 has not run, the correct report is *"built and unit-verified; never yet proven against the real backend"*. Never let a per-side green imply a working app; that gap is precisely what this pipeline's earlier version shipped. An unrun gate is reported as unrun, never simply left off the summary, the moment it is omitted, its absence reads as a pass. "I could not verify this here, and why" is itself a valid, complete result to hand back.

## Ownership of cross-cutting rulings

Four rulings in one project were recorded and never executed (a flow change no pass was fenced to make, a screen-drop no wave covered, a replaced polling loop never removed, a cleared blocker nobody re-checked) while every gate stayed green, because nothing *owned* the ruling itself.

1. **Every ruling names its executing pass at the moment it is made.** A
   ruling in `decisions.json`, a supersede, or a conflict resolution with no
   phase/wave assigned to carry it out is a wish, not a decision, the
   dispatcher does not record a ruling without also assigning who executes it.
2. **A blocked item names the machine-checkable fact that unblocks it.**
   Never "blocked on backend": write "blocked until `POST /signup` accepts
   `phone`," so a later pass can re-check it mechanically instead of relying
   on someone remembering to look.
3. **Adding a thing owes removing what it replaces, same pass, same commit.**
   A build agent that replaces polling with a push subscription removes the
   poll in the same change; a wiring agent that implements a moved step
   removes the old wiring in the same change. "Add" and "remove the
   superseded" are one task, not two.

## Parallel agents in one repository

A working tree is shared mutable state and agents do not know about each other:

1. **Each agent gets its own sandbox.** Its own detached worktree, DB prefix, ports and cache dir (a shared bundler cache once baked another agent's ports into a build, so screenshots showed the wrong app). It commits and pushes its own branch; the dispatcher merges by batch PR (merge commit, a comment with the gate comparison against base) and watches the deploy to success and the health endpoint. Never stash, `reset --hard`, `checkout -- .`, `clean`, rebase, amend, force-push or `pkill`; kill by PID (removing a worktree left 17 live servers; one stash captured 95 files of four other agents' work). Per-agent green on per-agent databases does not compose (law 9): the full suite runs once, in CI, after push. Before trusting a "done" report, compare the agent's reported file list with its branch diff.
2. **A fence needs a release valve, or agents fork around it.** A build agent that HALTS because it needs a change to shared or another module's code routes the request into a single queue (e.g. `shared-edit-requests.json`) drained by one serial pass between waves, never silently worked around. Forbidding edits with no alternative produces forks: one backend that fenced agents out of shared code grew the same service in four modules and redeclared one interface in twenty-five places.

## Autonomous mode and owner questions

After Phase 0 the user is asked in six cases only: a money figure the sources do not give; a legal, licence or brand word; a key, account or live number only the user holds; a destructive change to real money or data; ledger and provider disagreeing; changing a rule the user made. Everything else the dispatcher decides, and defaults are listed to the user, never asked. When the user has handed over ("implement it", "I'm going to sleep") the same holds in Phase 0.

**The rule: decide, record, continue. Never block, never silently skip.**

Everywhere else this document says HALT-and-ask, the dispatcher instead:

1. Applies the **documented default** for that halt. Each halt condition below
   names one; where it does not, the default is the conservative option, the
   one that is reversible, additive, or preserves existing behaviour.
2. Writes the call to `.pipeline/decisions.json` as "Default (lead), owner may override": what was decided, the options
   considered, the evidence, which default rule applied, and a `confidence` of
   `high | medium | low`.
3. Continues.

At the end of the run, emit `.pipeline/REVIEW.md`, the morning briefing: a one-page board (counts, one-word overrides, short labels, no paragraphs) leading with every `low` and then `medium` confidence decision, each naming the exact files to change if the owner overrides it. A recorded decision costs a minute to reverse; a question asked at 3am costs the whole night's progress.

**A number an agent has to invent (a cap, a limit, a rate) is marked PROVISIONAL in `decisions.json` with an owner, and REVIEW.md puts it first.** Fees, prices, limits and legal text come from the owner or config, never from a design or a guess.

**What autonomous mode does NOT relax:**

- **Destructive or irreversible actions** on real data or a protected surface.
  There the default is always the safe branch, recorded; never "proceed
  because nobody is watching". An absent user does not auto-approve a
  destructive migration; absence auto-*declines* it and logs it as blocked.
- **Evidence gates.** Phases 7 and 8 still run and still have to be green.
  Autonomy governs who chooses, not what counts as done. An unrunnable Phase 8
  is still a stated risk in the final report, never an implied pass.
- **Honest reporting.** The final report names which gates ran, which did not,
  and every call made on the user's behalf. Unattended runs raise the reporting
  bar rather than lowering it, precisely because nobody watched the middle.

**Defaults for the common halts**, so they never need inventing at 3am:

| Halt | Autonomous default | Confidence |
|---|---|---|
| Reconciliation conflict, screen vs screen | Take the richer shape (superset of fields); record both | medium |
| Reconciliation conflict, screen vs product truth | Product truth wins | high |
| Ambiguous entitlement (law 12) | Build it: the product is charging for it | high |
| Missing user-facing metric definition (law 14) | Cut the metric from the UI rather than ship a fake number | medium |
| Build agent fails contract tests twice | Leave the resource unbuilt, record it, continue other waves | high |
| Destructive migration required | Decline, record as blocked, continue | high |
| Phase 8 unrunnable | Run everything runnable; report the gap explicitly | high |

## Halt conditions (stop; the dispatcher applies the default above unless it is one of the six owner cases)

- Conflicts after reconciliation (Phase 3), including declaration-vs-screen and truth-vs-contract conflicts.
- Any agent reports the registry/scan-map is wrong or incomplete.
- A supersede entry matches no evidence (stale override) or two supersedes contradict each other.
- Phase 1 flags local persistence but Phase 0 has no sync strategy: loop back before extraction.
- A seam-introduction or UI-alignment agent believes it must change anything beyond its named files.
- A build agent fails its contract tests twice.
- Migrations fail on a fresh DB.
- Smoke pass failure that a single re-dispatch doesn't fix.
- A `repository-local-store` screen reaches the Phase-6 exit with no populate path or no non-manual trigger.
- Any `stubs.json` entry or `ui-align-tasks.json` task is unresolved at the Phase-6 exit, including the "deferred" ruling being absent rather than recorded.
- The Runtime contract names a connectivity source that does not exist as a real dependency (a hardcoded always-online constant is a HALT, not a default).
- Phase 8 cannot be run at all (no device/emulator/driver available). Say so plainly and get an explicit user ruling: never quietly declare the pipeline complete on Phases 1–7. An unrunnable Phase 8 is a known, stated risk, not a pass.
- Phase 8 shows a primary surface rendering empty, or rendering local/seed data where server data was asserted.

## References

- `references/agent-prompts.md`: the cost rules every agent gets, plus full prompt templates for every agent type (Build, Verify, Wire and the rest). Read before spawning any agent.
- `references/schemas.md`: JSON schemas for every artifact, including product-truths, declarations, supersedes, ui-align-tasks (four task kinds), stubs, scan-map (provenance + seed/design/stub sources), env-manifest.
- `references/framework-profiles.md`: the framework resolution waterfall + per-framework convention profiles (layout, validation, auth idiom, testing). Used to resolve the framework and prefill Phase 0 defaults.
