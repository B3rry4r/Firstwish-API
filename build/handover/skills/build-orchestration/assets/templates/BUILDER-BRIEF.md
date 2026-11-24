BUILDER {{BUNDLE}} | TIER {{T0|T1|T2}} | tasks {{IDS: 2 to 5 of one area and repo pair; never T0 mixed upward}}
Budget {{N}} steps (T0 25; T1 90 +30 per extra task; T2 130 +40). Machine: {{MACHINE_LINE}}; at most {{HEAVY_CAP}} heavy agents.
Read {{SCRATCH}}/common-rules.md, then only each task's Current state ({{TASK_FILES}}).

Owner's words: > {{OWNER_QUOTE}} ({{DATE}}). Covers: {{COVERS}}. Does not cover: {{NOT_COVERED}}.
Defaults already chosen: {{DEFAULTS}}. For anything else unclear pick the safest default, write "Default (lead), owner may override"
in the task's Current state and go on. Ask nobody.

Cases (input -> expected) per task:
  {{ID1}}: {{CASES}}
  {{ID2}}: {{CASES}}
Files (touch nothing else): {{FILE_MAP}}. Out of scope: {{OUT_OF_SCOPE}}.
Not built means not drawn or exposed: no do-nothing button, no placeholder row. An invented number is PROVISIONAL (code and hand-back).

Work: branch `{{BRANCH}}` (first task id; commits name every id) from origin/{{BASE}}; worktree {{WT_ROOT}}/b-{{low}}-<repo>. Ports {{PORTS}},
stack and db prefix `{{low}}`, migration stamp {{STAMP}}. Additive only: nothing a live client calls is renamed, retyped or widened.
Checks (quiet logs, gate on the EXIT line): affected tests, typecheck, lint on changed files. No full suite; do not wait on CI.
  T0: nothing more. T1: pictures only for screens (one 390 px light/dark pair beside the board); the stack only if a seam is claimed.
  T2: the stack, every drawn state of a pay screen, the money specs. {{TASK_SPECIFIC_CHECKS}}
Fill each task's Current state (30 lines or fewer). Push with retries, ls-remote, hand back at once with the head shas. Trailers: {{TRAILERS}}
Hand back in 10 lines: heads per repo and stamp; per task done or partial with its proof; CLAIMS one per line, each testable by someone
who has not read the code (UNTESTED if you could not); PROVISIONAL numbers; what did NOT run against the real thing, and why; EXIT lines.

PATCH VARIANT (fix round; replaces the tasks, cases and files lines): Round {{N}} of {{BUNDLE}}, continue from `{{BRANCH}}` on origin.
Fix ONLY these findings from {{VERIFY_FILE}}: F1 [{{SEVERITY}}] {{FINDING}}: {{HOW_TO_REPRODUCE}}. One test per finding. Budget T1 25 / T2 40.
