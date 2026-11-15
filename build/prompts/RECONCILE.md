RECONCILE (Phase 3) | TIER T1 | one task: write and run the mechanical reconcile script. Budget 120 steps. Text-only (no servers).
Read /home/user/Firstwish-API/build/common-rules.md; then /root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/SKILL.md lines 165-187
(Phase 3) and laws 8, 10-14; then /root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/references/schemas.md (registry, dep-graph, conflicts, ui-align-tasks, entitlements, field-flow, metrics).
Inputs (read-only, never edit): /home/user/Firstwish-API/.pipeline/{fragments/*.json (66 screens), declared/*.json (30), supersedes.json,
product-truths.json, decisions.json, stubs.json (228), conventions.md, scan-map.json, framework-decision.json}.

Write ONE script, /home/user/Firstwish-API/tools/pipeline/reconcile.py (Python 3, standard library only, deterministic: same inputs give
byte-identical outputs; it will be re-run when the admin screens' fragments arrive, so nothing is typed in by hand after it runs).
It does steps 1-9 of Phase 3 in order and writes into .pipeline/: registry.json, dep-graph.json (waves by topological sort; identity and
money first), conflicts.json, ui-align-tasks.json (four kinds), entitlements.json (every entitlement in the price book and truths ->
endpoint(s) and the test that will prove it; none -> a conflict), field-flow.json (writer, store, every reader; cross-actor edges flagged),
metrics.json (every number shown to a user -> writer path, formula, wording), reconcile-log.md (counts; each supersede applied or unmatched).
Where the same thing has different names across fragments (entity or field aliases), the script reads an alias table you write beside it
(tools/pipeline/aliases.json: alias -> canonical, each with the two sources that show they are the same). Classifying aliases is the only
judgment allowed; anything you are not sure is the same thing stays separate and is listed in conflicts.json as "possible-alias".
Never resolve a conflict: a decision already in decisions.json or supersedes.json is applied and cited by id; anything else is a conflict
row with its disagreeing sources, quoted. Do not invent endpoints no fragment, declaration or truth asks for. Money is integer kobo,
ids UUIDv7, time ISO-8601 UTC, phone E.164 (conventions.md); a field off the canon with no supersede is a conflict.

Check (quiet log, gate on EXIT): run it twice, outputs identical (sha256); every fragment action maps to exactly one endpoint or one
conflict row (print the count of unmapped: must be 0); every endpoint names its auth (public, user, role, staff role, webhook signature);
JSON valid. Commit on the current branch claude/sleepy-mayer-f0hkb8 in /home/user/Firstwish-API (do NOT push; touch only tools/pipeline/**
and the output files named above).
Hand back in 12 lines: head sha; counts (resources, endpoints, waves and what is in each, conflicts by kind, align tasks by kind,
entitlements with no endpoint, metrics with no writer); the ten conflicts that most block the build, one line each; what did not run.
