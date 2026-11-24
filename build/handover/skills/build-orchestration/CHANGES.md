# CHANGES (checker round 2)
- SKILL.md law 5 / section 7 and VERIFIER-BRIEF.md: deleted the round-3 exception; the severity rule is the same at every round.
- SKILL.md law 13, references/machine.md section 0, references/costs.md A9: cap = min(CPUs + 1, available GB / 2.5), measured at the start; WMT 9 heavy agents on 4 CPUs and 15 GB caused kills; start at the formula, drop one after any kill; the old "held" range removed as a measured fact.
- references/costs.md A1 and the lever table, COMMON-RULES.md, SKILL.md: cache reads were 79% of agent spend; re-reading earlier command output was 66% of spend (A1).
- assets/scripts/spend.py: exits with a clear message when nothing is priced (no division by zero); idle label now says "past the cache window".
- SKILL.md law 7, BUILDER-BRIEF.md, VERIFIER-BRIEF.md, COMMON-RULES.md: 100-step fix round and 60-step recheck are suggestions; verifier hand-back is 30 lines in SKILL.md and VERIFIER-BRIEF.md.
- Idle: "no idle over 4 minutes (the cache lapses at 5)" in the description, law 8, costs.md A2 and the lever table, COMMON-RULES.md.
- Owner item: new law 20 "Housekeeping is the orchestrator's job" and references/machine.md section 11 (triggers, steps, limits, WMT example 3.9 GB to 9.5 GB, obsolete task stopped at once); halt condition, section 8 step 7 and the briefs point to it.

## 27 Oct 2026: tiered workflow
- SKILL.md: new mechanics section 1 (tiers T0/T1/T2 and bundles of 2 to 5 tasks, one table); laws 3, 5, 7, 9, 10, 16 rewritten (verifier by tier, at most 2 rounds, 30-line fix on the lead's diff read, affected tests only and no agent waits on CI, briefs 25 lines, six owner cases); merge is now by batch (6 tasks or 6 hours, money first, merge agent); the lead stops hand-editing boards, polling CI, reading full reports.
- Description: "Not for" gains project-analysis; templates BUILDER-BRIEF (25 lines), VERIFIER-BRIEF (24), COMMON-RULES (34) are tier-aware and short; hand-backs 10 and 20 lines; Current state 30 lines.
- references/costs.md: tier figures (T0 1 run 3M; T1 2.3 runs 17.5M; T2 2.5 runs 38M; bundled x0.8) labelled "proposal 17 Oct, recalibrate"; machine.md: subagents never wait on CI.
- Measured reason cited once (41% of tasks 2+ rounds = 78% of tokens; fleet idle 65%; 279 runs / 4.9B to 74 runs / 1.5B). Correctness laws kept.
