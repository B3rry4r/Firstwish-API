# Changes to verification-harness (16 Oct 2026, from skills-review-A)

- VH-1 (must): SKILL.md "The baseline": a builder never adds, edits or deletes a baseline entry or a gate to get green; an entry is the lead's or owner's act in its own commit with owner and reason. Description, Install `--accept` comment, UNSET paragraph and gates.yml header made consistent.
- VH-2 (must): SKILL.md Install, new "Running it in an agent loop": log with an EXIT line, tail it, gate pushes on that line, EXIT 2 is a failure.
- VH-3 (must): SKILL.md tier 4, references/per-stack.md ("Who runs the live gate", scheduled bullet), assets/ci/live-gate.yml header: agents use sandboxes and stand-ins and never a real provider or production; the lead alone does the read-only live check; report "NOT RUN against the real provider: why".
- VH-4 (must): references/per-stack.md, new "Expo / React Native" section (web export at 390 px, own cache dir, grep the bundle for localhost, native blind spots).
- VH-5 (should): SKILL.md "Gates on a repo that already fails" (same FAIL lines as main, `--accept` only for first adoption) and new assets/gates/compare.py (52 lines, tested on a throwaway repo: moved code not new, new FAIL exits 1, bad ref exits 2).
- VH-6 (should): assets/ci/gates.yml triggers on every work branch (`push: branches: ['**']`), adds a `tests` job for the full suite, and notes compare.py for a main that already fails.
- VH-7 (should): references/per-stack.md "Plain HTTP API", new "Changing an API with paying users".
- VH-8 (should): removed all six dangling `LESSONS.md` pointers (SKILL.md, per-stack.md, writing-a-gate.md); the fact each pointed at is already stated in the text beside it.
- Housekeeping: every em-dash in the skill replaced (the owner's no-em-dash rule); SKILL.md and per-stack.md reference lists updated.
- Skipped (nice): VH-9, VH-10, VH-11.

## Fixer pass (16 Oct 2026, from the two checkers)
- Fix (medium): `run.py --json` now reports `files_scanned` and `inconclusive`, and exits 2 on zero files like the text mode; `compare.py` reads it and exits 2 ("could not compare") when either side scanned zero files, instead of "same 0 FAIL". Proved on a throwaway repo: zero-file globs give exit 2 (base side and tree side), matching globs give exit 0 (same) and exit 1 (new FAIL). SKILL.md "Gates on a repo that already fails" says so.
- Fix (low): `assets/ci/gates.yml` gets one `concurrency` group per branch name (`head_ref || ref_name`, cancel-in-progress), so a PR branch that fires both `push` and `pull_request` is checked once; `push: ['**']` stays so a branch with no PR yet still runs before merge.

## 27 Oct 2026: tiered workflow
- SKILL.md "Running it in an agent loop": per task an agent runs only the affected tests, typecheck and lint on changed files, and the gates, in quiet logs gated on the EXIT line; the full backend suite runs in CI on every push, the full app suite once per batch by the merge agent; agents never wait on or poll CI (push, hand back with head shas, the lead reads the run once).
- Depth by tier in one sentence (T0 affected tests and typecheck; T1 adds lint, gates, one light/dark pair per screen; T2 adds the live gate on a local stack and every drawn state of a pay screen).
- assets/ci/gates.yml comment: agents run only the affected specs and never wait on the job. Gates, baseline, compare.py and the "builder never edits a gate or baseline" law unchanged.
- To keep the skill the same length: the unbacked_promises paragraph, the "gates were wrong" intro and the baseline-adoption sentence were condensed (no rule dropped).
