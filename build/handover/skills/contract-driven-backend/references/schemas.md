# Pipeline artifact schemas

All artifacts are JSON in `.pipeline/`. Shapes below are the contract between phases; agents must emit exactly these.

## framework-decision.json (Phase 0: FROZEN after user confirmation)

```json
{
  "framework": "nestjs | laravel | express | fastify | django | other",
  "decidedBy": "directive | siblings | constraints | default",
  "confidence": "high | low",
  "evidence": [
    {"kind": "directive | manifest | constraint", "detail": "user said 'NestJS' in session", "source": "session | CLAUDE.md | path/to/composer.json"}
  ],
  "confirmedByUser": true,
  "frozenAt": "ISO timestamp"
}
```

## product-truths.json (Phase 0)

```json
{
  "source": {"kind": "doc | interview", "paths": ["docs/strategy.pdf"]},
  "truths": [
    {
      "id": "T-01",
      "kind": "entitlement | pricing | lifecycle | metric | invariant | doc-internal-conflict",
      "statement": "Reminders are core automation, included in ALL tiers, plans sell scale, never gate basics",
      "provenance": "strategy.pdf p.41 | interview answer",
      "confidence": "explicit | inferred"
    }
  ]
}
```

## declared/<resource>.json (Phase 0: same schema as a screen fragment, with:)

```json
{
  "screenId": null,
  "provenance": "declaration",
  "declaredAs": "integration | webhook | scheduler | ledger | reference-data | sync | other",
  "integration": {"provider": "paystack", "direction": ["outbound", "webhook-inbound"], "envVars": ["PAYSTACK_SECRET_KEY", "PAYSTACK_WEBHOOK_SECRET"], "sandbox": true},
  "reads": [], "actions": []
}
```
Declarations enter reconciliation as ordinary fragments; NOT conflict-exempt.

## supersedes.json (Phase 0+, append-only)

```json
{
  "entries": [
    {
      "id": "S-1",
      "asBuilt": "money fields are whole-naira floats across all screens/mocks",
      "targetState": "integer kobo minor units over the wire",
      "reason": "float money is unsafe; app-store billing reconciliation needs minor units",
      "approvedBy": "user",
      "approvedAt": "ISO timestamp",
      "wireVisible": true
    }
  ]
}
```
`wireVisible: true` ⇒ reconciliation MUST emit at least one ui-align task for it.

## ui-align-tasks.json (Phase 3 output, executed in Phase 6)

The ONE Phase-6 work queue. Every task is mechanically derived: from a supersede, a designed state the screen cannot enter, an unresolved stub, or a local-store screen with no populate path. Every task must end `done` or `deferred-by-user`.

```json
{
  "tasks": [
    {
      "id": "UA-1",
      "kind": "supersede | designed-state | stub | populate-path",
      "bornFrom": "S-1 | design:Dashboard·Offline | STUB-3 | screen:dashboard",
      "screenId": "debt-list",
      "files": ["lib/screens/debts/debt_list_screen.dart"],
      "change": "display amounts as ₦ formatted from kobo integers; remove naira float literals",
      "enterCondition": "for designed-state tasks: what must be true for this state to appear (e.g. connectivity lost)",
      "status": "open | done | deferred-by-user",
      "deferReason": "required when deferred: what the user accepted losing"
    }
  ]
}
```

## stubs.json (Phase 1 sweep + Phase 2 per-screen, resolved before Phase 6 exit)

Every placeholder standing in for a real source. Detected by pattern, not by noticing.

```json
{
  "stubs": [
    {
      "id": "STUB-1",
      "kind": "hardcoded-signal | todo-comment | fake-provider | unbacked-toggle",
      "file": "lib/data/sync/sync_service.dart:41",
      "evidence": "final ValueNotifier<bool> online = ValueNotifier(true);  // Real impl: connectivity_plus",
      "standsInFor": "device connectivity state",
      "consequence": "every offline UI branch is unreachable at runtime",
      "resolution": "unresolved | implemented | deferred-by-user | not-a-stub",
      "taskId": "UA-7"
    }
  ]
}
```
Detection patterns to grep, not eyeball: `ValueNotifier(true|false)` / constant state holders feeding UI conditions; comments matching `real impl|TODO|FIXME|stub|mock|for now|later`; providers bound to `Fake*`/`Stub*`/`Mock*` outside tests; toggles whose write path reaches no API.

## env-manifest.json (accumulated by build agents)

```json
{
  "vars": [
    {"name": "PAYSTACK_SECRET_KEY", "introducedBy": "payments", "purpose": "Paystack API auth", "secret": true}
  ]
}
```

## scan-map.json (Phase 1)

```json
{
  "framework": "flutter | nextjs | react | other",
  "frameworkDetail": "Flutter 3.x with go_router",
  "dataLayerPattern": "Human description of how screens get data, precise enough for an extraction agent to follow",
  "dataLayerPaths": ["lib/data/repositories", "lib/data/models"],
  "exampleFiles": ["lib/data/repositories/debt_repository.dart"],
  "localPersistence": {"present": true, "packages": ["drift"], "modelPaths": ["lib/db/"], "syncStrategyRequired": true},
  "seedSources": [
    {"file": "lib/data/seed.dart", "populates": "local drift store", "gating": "const bool.fromEnvironment('SEED_DEMO_DATA'), off by default", "risk": "seeded rows flow through the real read path; a human cannot tell them from server data by eye"}
  ],
  "designSources": [
    {"path": "designs/OweMe Hero Screens.html", "kind": "canvas-export | screenshots | design-system | tokens",
     "statesDefined": [{"screenHint": "dashboard", "states": ["loading", "offline", "empty", "populated"]}]}
  ],
  "screens": [
    {
      "id": "debt-list",
      "title": "Debt List",
      "uiFiles": ["lib/screens/debts/debt_list_screen.dart"],
      "dataFiles": ["lib/data/repositories/debt_repository.dart", "lib/data/models/debt.dart"],
      "dataProvenance": "repository-direct | repository-local-store | inline | mixed | static",
      "localStore": {"reads": "drift DebtsTable via watchDebts()", "populatedBy": null},
      "inlineLiterals": [{"file": "lib/screens/plans/plan_screen.dart", "description": "hardcoded plan tier list, lines ~40-90"}]
    }
  ]
}
```
`dataProvenance: "repository-local-store"` with `localStore.populatedBy: null` is the signature of a screen that will look correct and be blind to the backend. Phase 3 owes it a `populate-path` task.

## fragments/<screen>.json (Phase 2)

```json
{
  "screenId": "debt-list",
  "reads": [
    {
      "entity": "Debt",
      "fields": [
        {"name": "amount", "type": "number", "nullable": false},
        {"name": "customerName", "type": "string", "nullable": false},
        {"name": "dueDate", "type": "date", "nullable": true}
      ],
      "cardinality": "list | single",
      "filtersOrSort": ["status", "dueDate desc"],
      "pagination": "infinite-scroll | paged | none"
    }
  ],
  "actions": [
    {
      "name": "markPaid",
      "kind": "update | create | delete | custom",
      "entity": "Debt",
      "payload": [{"name": "debtId", "type": "string"}, {"name": "paidAmount", "type": "number"}],
      "expectedResponse": {"entity": "Debt", "cardinality": "single"}
    }
  ],
  "authContext": {"requiresAuth": true, "rolesObserved": ["owner", "staff"]},
  "special": {"realtime": false, "uploads": false, "downloads": false},
  "uiStatesHandled": [
    {"state": "loading", "entersWhen": "snapshot.data == null", "reachable": "unknown | yes | no",
     "note": "local store resolves synchronously, this may never be perceptible"},
    {"state": "empty", "entersWhen": "list.isEmpty"}
  ],
  "uiStatesDesigned": ["loading", "empty", "error", "offline"],
  "stubsObserved": ["STUB-3"]
}
```
`uiStatesDesigned` minus `uiStatesHandled` = one `designed-state` task each, emitted by Phase 3. A state present in `uiStatesHandled` with `reachable: "no"` is ALSO a task; coded is not reachable.

## registry.json (Phase 3: FROZEN after approval)

```json
{
  "version": 1,
  "frozenAt": "ISO timestamp",
  "resources": [
    {
      "name": "Debt",
      "fields": [{"name": "id", "type": "string"}, {"name": "amount", "type": "number", "nullable": false}],
      "sourceScreens": ["debt-list", "debt-detail", "record-debt"],
      "endpoints": [
        {
          "method": "GET",
          "path": "/debts",
          "query": [{"name": "status", "type": "string", "optional": true}],
          "response": {"shape": "PaginatedList<Debt>"},
          "roles": ["owner", "staff"]
        },
        {
          "method": "POST",
          "path": "/debts/:id/mark-paid",
          "body": [{"name": "paidAmount", "type": "number"}],
          "response": {"shape": "Debt"},
          "roles": ["owner"]
        }
      ]
    }
  ],
  "sharedShapes": {
    "PaginatedList<T>": "per conventions.md pagination wrapper",
    "ErrorEnvelope": "per conventions.md"
  }
}
```

## dep-graph.json (Phase 3)

```json
{
  "edges": [{"from": "Debt", "to": ["User", "Customer"]}],
  "waves": [["User", "Customer"], ["Debt"], ["Payment", "Reminder"]]
}
```

## conflicts.json (Phase 3: must be empty/absent to proceed)

```json
{
  "conflicts": [
    {
      "kind": "type-mismatch | field-identity | role-contradiction | cycle",
      "entity": "Debt",
      "detail": "debt-list sees amount as number; record-debt sends it as string",
      "fragments": ["debt-list", "record-debt"],
      "options": ["number (recommended: UI renders arithmetic)", "string"]
    }
  ]
}
```

## status.json (dispatcher state)

```json
{
  "phase": 5,
  "wave": 2,
  "completed": {"extract": ["debt-list", "..."], "build": ["User", "Customer"]},
  "failed": [],
  "registryFrozen": true,
  "updatedAt": "ISO timestamp"
}
```
