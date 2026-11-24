# The cost model and where its numbers come from

The model prices the **tiered workflow** (build-orchestration): effort matched to risk, bundles, only affected tests per task, full suites in CI and once per batch, at most 2 fix rounds, the lead reads T0 diffs instead of a verifier. It replaced a heavy workflow where every task, a one-line copy change included, got a builder, a full app check, a verifier and its own merge. Never cost a plan on the heavy figures; they are below only for comparison.

All dollar figures are API-equivalent (what the same tokens would cost at API prices). A subscription plan is a weekly allowance of that work.

| Constant | Value | Source |
|---|---|---|
| T0 per task | 1 run, 3M tokens, 0.2 agent-hours | workflow analysis, 17 Oct 2026 (FIX-50 measured 2.5M) |
| T1 per task | 2.3 runs, 17.5M tokens, 0.9 h | proposal: 12M builder + 4M lean verifier + 30% x 5M patch round |
| T2 per task | 2.5 runs, 38M tokens, 1.5 h | proposal: 20M builder (measured median 18.4M) + 12M verifier + 50% x 12M round |
| Size factor | S 0.6, M 1, L 1.8 | ASSUMED: the tier figures are typical (M) tasks |
| Bundled task | x 0.8 | the fixed start (rules, worktree, installs: 33% of a builder's steps) paid once |
| Merge run | 15M tokens per 6 tasks | the batch's full suites and stack, once |
| Found work | +20% | new fix tasks discovered during the build |
| Lead | 18% of spend | the lead's measured share |
| $ per million agent tokens | 0.214 | $3.31 per 15.5M-token run, 16 Oct |
| Range | light 0.7, heavy 1.4 | spread of $ per run (3.9 / 5.5 / 7.8) |
| Plan-week (Max 20x) | about $2,300 of API-priced work | ~91% used at ~$2,100, 10 to 13 Oct |
| Plan price | $200 a month | public price; check before quoting |
| FX | 1,400 NGN per dollar | covers card FX charges over the official ~1,330 |
| Fleet burn | 140M tokens an hour at 8 agents | 16 to 17 Oct |
| Duty cycle | 60% of the clock at full fleet | taps, merges, restarts, nights |
| Chain link | task hours + 1 h (CI, hand-back, merge), 16 h a day | ASSUMED from CI medians (17.8 min suite) |

For comparison, the heavy workflow measured 3.45 runs and 53.6M tokens per task on average (mobile screens 91.4M and 4.5 runs; money paths 61.7M). The analysis projected the same remaining WAWU work at about 279 runs and 4.9B tokens heavy, against about 74 runs and 1.5B tiered.

## Recalibrating

After the first week of a new build:
1. Sum tokens per finished task from the agent transcripts (build-orchestration's spend script), by tier and size, bundled or not.
2. Count runs per task, the first-round pass rate and the rounds per tier.
3. Measure the plan-week: dollars of API-priced work done before the plan's limit stopped the fleet.
4. Put the new numbers in a params.json (same keys as DEFAULTS in estimate.py) and re-run; show the owner the change on the same page.

## What the model does not cover

- Owner waits (keys, accounts, store review, legal, merge taps): listed separately with their own days.
- Provider and hosting bills (servers, storage, SMS, payment fees): ask the owner or quote the provider's own price page, never guess.
- Human design work outside the agents: an owner item if a person must do it.
