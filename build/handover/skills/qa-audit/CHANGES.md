# Changes to qa-audit (16 Oct 2026, from skills-review-A)

- QA-1 (must): SKILL.md new "Mode B: check one task" (claims to test, compare with base, exact cases, run touched specs and read CI, small UI gets a verifier, about 120 steps and quiet logs, one verdict file of 40 lines or fewer, no Artifact). Description and a "Pick the mode" section added; short-form cost rules (quiet logs, 4 minute idle, stop servers by PID, cheaper model tier) live in Mode B.
- QA-2 (must): law 11 now has `kind` plus `severity` (blocker, high, medium, low) and a `merge`/`fix` verdict; blocker, high, medium get a round, low goes to the sweep list, stop at round 2 unless a blocker remains. Phase 5 table updated.
- QA-3 (must): Phase 2 "Live-system probes" for money, limited resources, account deletion and provider webhooks.
- QA-4 (must): law 12 rewritten: agents verify payment and identity seams against stand-ins or the sandbox, name them, report "NOT RUN against the real provider: why"; the lead alone does the live check. Phase 7 carries the same line.
- QA-5 (must): law 10, Phase 3 false-capture guard and references/flow-and-substate-specs.md: a capture from a build pointing at another agent's ports is false; own cache dir, grep the bundle for `localhost:`.
- QA-6 (should): Phase 2 role x control matrix.
- QA-7 (should): SKILL.md cut from 462 to 290 lines; every "Observed:" story moved to new references/scars.md (one clause per law kept); the dangling LESSONS.md pointers removed; the `conformance` paragraph moved out of the status list in references/coverage-enumeration.md.
- QA-8 (should): Phase 4 one composite PNG per screen (design | app, light and dark rows), opened once, verdict written at once.
- QA-9 (should): `merge` needs the pushed head's CI green and gate FAIL lines equal to main's; the verifier reads CI, does not rerun it (Mode B step 6).
- Owner rules applied (not review ids): show only what is built (law 14 and a `blocked` conformance value, so an unbuilt task's absence is not a defect and a do-nothing control or placeholder row is); pages for the owner are visual (Phase 7 and references/human-deliverable.md); a separate verifier for every task.
- Housekeeping: every em-dash replaced (the owner's no-em-dash rule).
- Skipped (nice): QA-10, QA-11. QA-12 is applied, not skipped: law 1 and Mode B keep a separate verifier for every task (owner rule), never one per wave.
- Machine budget block added by the checker (16 Oct 2026 owner rule): measure the machine, heavy-agent cap, 5 GB start rule, memory-kill symptoms, disk, CI for full suites.

## Fixer pass (16 Oct 2026, from the two checkers)
- Fix (high): description cut from 1121 to 1022 characters (limit 1024); triggers (including "is this actually done") and both do-not guards kept.
- Fix (low): law 11 defines the `merge` verdict with the CI-green and gate-lines-equal-main condition (QA-9) where the verdict is defined.
- Fix (low): Mode B step 5 defines `$S` (the agent's own scratch folder, with logs and pids).
- Consistency: Machine budget heavy-agent cap is now min(CPUs + 1, available GB / 2.5) measured at the start (WMT example kept); idle rule is "look again within 4 minutes (the cache lapses at 5)". One Machine budget block kept.
- Machine budget, housekeeping (owner, 16 Oct 2026): the one Machine budget block gains the dispatcher's housekeeping rule (after every merge, every few hours, and at once under about 20% or 5 GB free disk or 5 GB available memory: df/free/process list, remove merged or abandoned worktrees and scratch folders, delete large leftovers, stop orphan servers by PID; never touch a running agent's folder or evidence an open task cites; no new heavy agent while under the line) with the WMT example (108 folders cleared, 3.9 GB to 9.5 GB free, 12 agents running).

## 27 Oct 2026: tiered workflow
- Mode B is now "check one task or bundle" with a tier table: T0 no verifier (the lead reads the diff), T1 lean verifier (~35 steps +10: claims, affected tests, one light/dark picture pair for screens, every drawn state), T2 full verifier (~90 +20: money attacks, wrong-format input, every drawn state of a pay screen, local stack); re-check of named ids ~15 steps.
- Law 11: at most 2 rounds then the lead rules or re-cuts (the "unless a blocker remains" exception is gone); a fix of 30 lines or fewer closing named findings is accepted on the lead's diff read; the verifier never waits on or reruns CI, the lead reads the run once.
- Hand-back 20 lines (severities); Mode A stays the full audit and is never run per task; machine budget block shortened, same rules and numbers.
