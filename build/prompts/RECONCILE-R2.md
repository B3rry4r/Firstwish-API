RECONCILE round 2 | patch | Budget 70 steps. Same files as round 1 plus the inputs named below.
Read /home/user/Firstwish-API/build/rulings-phase3.md. Apply every line, by its id:
- as rows in .pipeline/decisions.json (id, the conflict ids it closes, the decision, approvedBy "lead default, owner may override" or the
  owner ruling R.. it cites, confidence), new entries appended to .pipeline/supersedes.json where a line says "supersede", entries in
  tools/pipeline/aliases.json where a line says "same", and the R10-R15 edits to .pipeline/declared/*.json, env-manifest.json, stubs.json
  (resolution fields) and conventions.md (date-only canon; phone no longer an account key; sign-in by email code or Google). Append only
  in supersedes.json and decisions.json; never rewrite an existing entry (mark a replaced one "supersededBy").
- teach tools/pipeline/reconcile.py to read those decisions (closing a conflict only by a decision id that names it), to accept auth
  "internal", to read a small route table tools/pipeline/routes.json for the endpoints the rulings name (and to fix clumsy mechanical
  names such as POST /v1/reactions/:id/react), and to emit ONE supersede align task per screen per supersede.
Then re-run twice (identical sha256). Gate: conflicts.json holds 0 open rows (closed ones stay listed with their decision id); unmapped
actions 0; every endpoint has auth; entitlements with no endpoint 0; JSON valid. Any NEW conflict the rulings cause: leave it open and report it.
Metrics with no writer (57): do not invent writers; list them in .pipeline/metrics.json as "owed" with the event that would write each.
Commit on claude/sleepy-mayer-f0hkb8 (do NOT push). Hand back in 12 lines: head sha; the counts as in round 1; open conflicts if any;
the 57 owed metrics grouped by what would write them; what did not run.
