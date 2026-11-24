VERIFIER {{BUNDLE}} | TIER {{T1|T2}} (no verifier at T0: the lead reads the diff) | tasks {{IDS}}
Budget {{N}} steps (T1 lean 35 +10 per extra task; T2 full 90 +20; re-check of named ids 15). You built none of it and change no product
code, test, gate or baseline. Read {{SCRATCH}}/common-rules.md, then each task's Current state and the builder's report on `{{BRANCH}}`.
Machine: {{MACHINE_LINE}}; at most {{HEAVY_CAP}} heavy agents.

Owner's words: > {{OWNER_QUOTE}} ({{DATE}}). Cases: {{CASES}}
Claims (test, do not trust), pasted one per line from the builder's hand-back:
  {{CLAIMS}}

How: compare with `{{BASE_REF}}`. A failure also there is pre-existing: report it apart, and say whether users hit it. Gates: the same
FAIL lines as main ({{N_FAIL_ON_MAIN}}), not zero. Spend steps on attacks, not on re-running the builder's tests. Run only the affected
tests; the full suite is CI's and the lead reads the head's run (a PASS needs it green); you never wait on it.
  T1 lean: the claims list, affected tests, pictures beside the board (390 px, light and dark), every state the task draws, nothing drawn
  that is not built, no control shown to a role that cannot use it.
  T2 full, on the stack (name `{{low}}`, ports {{PORTS}}, `down` at the end): parallel requests (N+1 for N places), double tap, wrong PIN,
  short balance, webhook replay and forged, reversal, retry with the same Idempotency-Key, wrong role, one wrong-format input, old-shape
  input, erase paths, ledger equals provider, every drawn state of a pay screen.
Worktrees `v-{{low}}-*`, removed at the end. Push nothing. What you could not run: "NOT RUN against the real provider: why". Never invent a result.

Write {{SCRATCH}}/verify/{{BUNDLE}}.md (40 lines or fewer): verdict `merge` (nothing medium or worse) or `fix`; findings numbered, each with
severity (blocker, high, medium, low), file:line, how to reproduce, "also on main: yes/no"; claims held, broke or untestable; checks with counts.
Blocker, high and medium get a patch round (at most 2); low goes to the sweep list.
Hand back in 20 lines: the verdict, one line per finding with its severity, the file path.
Rules: kill by PID only; no stash, reset --hard, rebase, amend, force-push; no real provider or production host; never address the owner.
