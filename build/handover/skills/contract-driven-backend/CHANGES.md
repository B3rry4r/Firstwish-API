# Changes (16 Oct 2026, from the WMT build review)

Ids: S = stale item, M = must, SH = should (review B, section 1); letters in brackets are lesson ids.

- M1 (must) agent-prompts.md header: COST RULES block pasted verbatim, with step budget and own worktree/DB/ports/cache/branch; SKILL Dispatcher rules: model set on every spawn, dispatcher writes no task code, waits with shell loops [A1-A3, A10, D1-D5, D7].
- M2 (must, S1) agent-prompts.md: new section Verify (lean verifier brief); SKILL law 6, law 17, Phase 5 and Phase 6 gate now need the contract tests AND a separate verifier's `merge`; Build template ends with a CLAIMS list [B1, B2, B4, B9, A4, A7].
- M3 (must) agent-prompts.md Build: new step 5 for money or limited-capacity resources (settle against the row's amount, FOR UPDATE, expiring holds, Idempotency-Key, real parallel specs) [C3, B1].
- M4 (must, S3) SKILL Dispatcher rules, Phase 2, Phase 5, Phase 6: "same turn" removed; read-only agents free, heavy agents capped [A9].
- SH1 (should, S2) SKILL Parallel agents: rules 1 to 3 replaced by one sandbox rule (own worktree, DB prefix, ports, cache dir, push own branch, merge by PR, never stash/reset/clean/rebase/amend/force-push/pkill, kill by PID); release valve kept [D1-D3, D6].
- SH2 (should) SKILL Phase 4: "Test kit" pre-step [A6].
- SH3 (should, S5) SKILL law 16: baselined failures, line-by-line FAIL comparison, pre-existing user-facing failure gets its own task [B4, B5].
- SH4 (should) SKILL Autonomous mode and law 8: invented numbers are PROVISIONAL with an owner and listed first; fees, prices, limits and legal text come from the owner or config [B8, E4].
- SH5 (should, S4, S7) SKILL Dispatcher rules and Phase 5: lean briefs; build step 3 now runs only touched specs plus typecheck and lint; severity decides fix rounds (low findings to .pipeline/sweep.md) [A5, A7, A8, A3, A4].
- SH6 (should) SKILL Phase 0 Step 4: rulings recorded in the owner's exact words, who, when, covers/does not cover; ambiguous phrases are asked [B6, E3].
- SH7 (should) SKILL Phase 7: the deploy's own test job runs on the branch before merge [B3, C7].
- Owner rules (16 Oct): SKILL Phase 6, a part of a screen whose backing is not built is not drawn (no do-nothing control, no placeholder row) [E2]; REVIEW.md is a one-page board with one-word questions [E1].
- Coordinator note (16 Oct): new "Machine budget" block in agent-prompts.md beside COST RULES (measure first, cap about CPU+1 and 2.5 GB each, wait for 5 GB, memory kills are memory, watch disk); SKILL Dispatcher rules point to it.
- S6 (nice item, done for consistency): law 15 cut to two sentences and reconciled with the verifier gate (a verifier's `merge` rests on attacks it ran, not opinion); citations dropped.
- Hygiene: every em-dash removed from SKILL.md and all references; YAML description kept valid; no LESSONS.md pointer existed, none added.
- Not applied (nice): integration-safety line (existing capabilities, stand-ins only, claim-before-send, GET confirms/POST unsubscribes) [C6, C8, C9].

## Fixer pass (16 Oct 2026, from the two checkers)
- Fix (low): laws 16 and 17 get back their rationale lines ("a failing test everyone works around stops being a signal"; "the incentive to see completion runs the same way as the effort just spent") and the two observed examples, short: the teardown that leaked an upload slot, the 188 screenshots.
- Fix (low): Phase 0 says `verification-harness` and `qa-audit` are used if installed (this skill ships neither); if not, the minimum gate is inline: typecheck, lint and touched specs gated on the log's `EXIT 0` line, a deferral-phrase grep over the diff, FAIL lines equal to the base branch's line by line, and a separate verifier on every task.
- Consistency: heavy-agent cap is min(CPUs + 1, available GB / 2.5) measured at the start (Dispatcher rules, MACHINE BUDGET block; the COST RULES "about 3 agents" line now points to that block); idle rule is "look again within 4 minutes (the cache lapses at 5)". Still one Machine budget block.
- Machine budget, housekeeping (owner, 16 Oct 2026): the one Machine budget block gains the dispatcher's housekeeping rule (after every merge, every few hours, and at once under about 20% or 5 GB free disk or 5 GB available memory: df/free/process list, remove merged or abandoned worktrees and scratch folders, delete large leftovers, stop orphan servers by PID; never touch a running agent's folder or evidence an open task cites; no new heavy agent while under the line) with the WMT example (108 folders cleared, 3.9 GB to 9.5 GB free, 12 agents running).

## 27 Oct 2026: tiered workflow
- New short section "Tiers and bundles" (T0 lean, T1 plain, T2 money and identity, bundles of 2 to 5, affected tests only, no CI waiting, rounds by severity max 2, batches at 6 tasks or 6 hours); it points to build-orchestration for the fleet.
- Laws 1, 6, 17, Phase 5 and Phase 6 gates: a verifier per T1 or T2 bundle (not per task), the lead's diff read for T0; build agents are per bundle with a fence per resource module.
- Phase 7, Dispatcher rules, Parallel agents: full suite in CI on every push (agents never wait or poll; a no-model watcher), lead stops hand-editing boards and reading full verifier reports, briefs from templates (25 lines, hand-backs 10 and 20), merge by batch PR.
- Autonomous mode: owner questions only in six cases; every other default is recorded as "Default (lead), owner may override" and listed, never asked.
- agent-prompts.md: COST RULES tests and budget lines, Build (bundle, T2-only money step, 10-line hand-back) and Verify (T1 lean vs T2 full, re-check of named ids) templates are tier-aware. Net 658 -> 644 lines across SKILL.md and agent-prompts.md.
