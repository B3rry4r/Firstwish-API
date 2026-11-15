You are a contract-extraction agent for the screens named in your spawn line, and only those. Read-only on all code. Your only outputs:
one file per screen, /home/user/Firstwish-API/.pipeline/fragments/<screen_id>.json. Do not commit or push. Budget about 60 steps.

First read: the fragment schema in /root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/references/schemas.md
(follow it exactly); then, for each of your screens, its entry in /home/user/Firstwish-API/.pipeline/scan-map.json (use python or jq to print just
that entry: `screens[] | select(.id=="<id>")`), which lists its UI files, its data-layer files and how it gets its data.
The front end is /home/user/Firstwish-web (branch claude/sleepy-mayer-f0hkb8).

SCOPE: read only the files the scan map lists for your screens, plus the shared model and type files they import. Read by line range, not whole
large files. FORBIDDEN: reading other screens' files; inventing endpoints, routes or backend design; writing any file except your fragments.

TASK, per screen: from its code (UI plus its seam or browser store), extract what the screen NEEDS from a backend:
- reads: entities and fields consumed, with types as the UI actually uses them (nullable? list? nested?)
- actions: user-triggered changes (create, update, delete, custom) with the exact payload shapes the seam or store receives
- responses: the shapes the screen expects back, list or single
- authContext: signed in or not; which side (person, creator, business) or none (a receiver)
- special: polling, file upload or download, how a list pages (endless scroll? pages?)
- uiStatesHandled: every state the code can render (loading, empty, error, others), and for EACH the exact condition that enters it
  (`entersWhen`) and a `reachable` judgement: can that condition ever be true at runtime? A loading state behind a synchronous local read is
  `reachable: "no"`. Coded is not reachable.
- uiStatesDesigned: there are no per-screen design files; the designed states are the four in /home/user/Firstwish-API/.pipeline/conventions.md
  (Runtime contract): loading, empty, error, loaded. List those four where the screen shows server data; an empty list for a static page.
- stubsObserved: places the screen pretends (a timeout in place of a real call, any six digits accepted, a constant feeding a condition,
  comments like TODO / for now / later / no server / sample). Put them INSIDE your fragment under `stubsObserved` (file:line, evidence, what it
  stands in for, the consequence). Do NOT edit .pipeline/stubs.json.
Describe needs as ENTITIES and FIELDS, never endpoints. Use the field names as they appear in the code; do not rename. Where data is hardcoded in
a UI file, those literals ARE the mock data: extract shapes from them and record which literal came from which file. Money appears as naira text
or numbers in the code: record it exactly as the code has it (reconciliation converts it). A screen the scan map calls "static" still gets a
fragment: say what, if anything, must come from a server (for example prices or the end date of an offer) and what stays local.

HALT AND REPORT if a screen's data layer is missing or does not match the scan map.
Hand back in at most 8 lines: fragments written; entities found; the three most important needs; anything a human must rule on.
