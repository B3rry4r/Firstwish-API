RECONCILE the admin screens in | TIER T1 | Budget 80 steps. Text-only.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/RECONCILE.md (the original task), then the section "Admin screens
joined" at the end of build/rulings-phase3.md. Then read tools/pipeline/reconcile.py by its function list first (grep -n "^def "), and
only the functions you must change; tools/pipeline/aliases.json and routes.json are its tables.
State: 23 admin fragments are in .pipeline/fragments/admin-*.json and scan-map.json; `python3 tools/pipeline/reconcile.py` now ends
EXIT 1 with 20 open conflicts (.pipeline/conflicts.json, status "open"): 14 unclassified-entity, 1 possible-alias, 2 truth-mismatch,
2 unparseable-action, 1 role-contradiction.
Do: apply rulings A1 to A13 as rows appended to .pipeline/decisions.json (same shape as DEC-109: id, topic, closes[{conflict,key,detail}],
decision, approvedBy, confidence, source, decidedAt, fieldTypes?), entries in aliases.json (screen-scoped where the name is a view),
routes in routes.json (every admin action and read under /v1/admin with its staff roles), and the smallest changes to reconcile.py
they need (bracketed view names, hyphenated actions, fixture figures skipped by the truth check, auth "staff role" carrying its roles).
Never rewrite an existing decision or supersede; never invent an endpoint no fragment, declaration or ruling asks for.
Gate (quiet log, EXIT line): run twice, identical sha256 of every output; OPEN CONFLICTS 0; UNMAPPED ACTIONS 0; ENDPOINTS WITHOUT AUTH 0;
entitlements without endpoint 0; every /v1/admin endpoint has auth staff role with at least one role; no admin action without a
`reason` in its payload (list any). A NEW conflict your changes cause: leave it open and report it; do not force it shut.
Commit on claude/sleepy-mayer-f0hkb8 in /home/user/Firstwish-API (do NOT push). Hand back in 12 lines: head sha; counts (resources,
endpoints total and under /v1/admin, waves with the admin resources' wave, conflicts closed/open, align tasks by kind, owed metrics);
open conflicts if any; admin actions with no reason; what did not run.
