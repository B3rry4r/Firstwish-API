# Costs: what a 126-agent build measured (worked example)

The WAWU build, 10 to 14 Oct 2026: a NestJS backend with paying users, a website, an identity service and an Expo app.
One Opus lead orchestrated. 126 Sonnet agents built or checked tasks. Agents cost $1,936 at API prices, the lead $177
(8% of the total). Ids A1 to A11 are the lesson ids used across the skill set. Reproduce every figure below on your own
build with `assets/scripts/spend.py`; the run on these transcripts gave $1,957 for agents and $175 for the lead, so the
script is within about 1% of the hand count.

## How to read a bill
Cost per step = (tokens the model reads again) x (cache-read price) + (what is new) x (write price) + output.
The context only grows, so a step late in a long run costs far more than an early one. Two levers follow: fewer steps,
and less text in the context per step. Everything else in this file is one of those two.

## A1. Cost is steps x context
| steps in the run | agents | total | per step | avg max context |
|---|---|---|---|---|
| under 100 | 20 | $53 | $0.038 | 182k |
| 100 to 199 | 49 | $478 | $0.063 | 354k |
| 200 to 299 | 46 | $1,009 | $0.092 | 535k |
| 300 and up | 11 | $417 | $0.099 | 726k |

57 of 126 runs went past 200 steps, and they were 73% of agent spend. Cache reads were 79% of agent spend, and the part
that was re-reading earlier command output was 66% of spend (the context an agent drags along). A 300-step run costs about $30. The same task in 150 steps costs about $9.50. The cure is in the brief:
a step budget, quiet output (`tail -n 15` of a log), reads by line range.

## A2. Idle past the cache window rewrites the whole context
The prompt cache lapses at 5, so the rule is to look again within 4 minutes. A subagent that waits longer (a long sleep,
a test run watched in the foreground, a monitor wait) pays to write its entire context again. Measured: 314 times, $275, 14% of agent spend (`spend.py`: 313
lapses, $251). Cure: look again within 4 minutes, or hand the wait to a shell script that costs no tokens (the lead).

## A3. Tests and waiting were 45% of spend
Builder and verifier each ran the full 290-spec backend suite locally: 2,286 test launches, each polled for. The same
suite already ran in CI, but only after merge. Cure: CI runs the full suite on every work-branch push; agents run the
specs for files they touched; the lead reads the head's CI run once, and no agent waits on it (law 9).

## A4. Fix rounds
Round 1 was 50% of spend, round 2 22%, round 3 11%, rounds 4 to 6 17% (`spend.py` by round: 49, 23, 11, 17). Rounds 3
and later mostly fixed low findings and test gaps. One task reached round 6 and cost $201 (13 agents). Cure: severity
decides rounds (law 5). Lows go to a sweep list that one builder and one verifier drain together.

## A5 and A8. Fixed context
Task files grew to 50 to 73k tokens because every round appended its record, and every later agent re-read them
(9% of spend). The fixed start context was 59k tokens a step (system rules, tool lists, the brief): 14%. Cure: a brief
is never appended to; findings go in a separate small file; the common rules file stays under 120 lines; an agent reads
an extract of the rulings, not the whole file.

## A6. Hand-built test stacks
Every agent built its own server, mock identity service, database and web build: 6% of spend, plus setup mistakes that
cost rebuilds. Cure: one stack script (`up`, `status`, `down`), built once, named in every brief.

## A7. What a lean brief is worth
A payment-path task with a lean brief (exact cases to test, a file map, a step budget, no optional extras) cost $28 for
2 builds and 2 verifies, with nothing above low. Comparable tasks cost $93 to $201. Medians in the 126 runs: a builder
$14.4, a verifier $12.7. A lean verifier costs $1 to $5.

## A9. Parallelism has a ceiling
9 agents on 4 CPUs and 15 GB of memory gave out-of-memory kills (jest workers dying with SIGKILL, servers dying with no
error), timing tests that flaked under load average 20 to 28, and re-runs of everything. Size the cap from the measured
machine (`references/machine.md` section 0: `min(CPUs + 1, available GB / 2.5)`, measured at the start), start at the
formula, drop it by one after any kill, and move suites to CI. Text-only agents (research, review of a diff) are not heavy. Disk is a
second limit: about 600 MB was left before 4.1 GB of video files and an orphan worktree were deleted.

## A10. Which model
Fleets of Opus agents burned the owner's plan allowance in two days. The rule that followed: every agent is the cheaper
model, set on every spawn (an unset model inherits the lead's); the lead only orchestrates; a resumed agent keeps its
original model, so a dear-model agent is never resumed (start a fresh cheap agent that picks up the saved worktree or
branch). The lead's own $177 was the cost of deciding, merging and waiting; it did not grow with the number of agents.

## A11. Plan sizes (checked 12 Oct 2026; look them up again)
The $200 plan's 5-hour window was 4x the $100 plan's, but its weekly allowance only about 1.7x. Three $100 plans gave
more weekly volume than one $200 plan. Plans change. Never assume a size, never state what you cannot see in someone's
account: look it up, or ask the owner.

## What each lever was worth
| lever | law | measured share it addresses |
|---|---|---|
| quiet output, line-range reads | 6 | 79% of agent spend was cache reads; 66% of spend, earlier output |
| step budgets | 7 | 57 runs past 200 steps = 73% |
| no idle over 4 minutes | 8 | 14% |
| CI runs full suites | 9 | 45% (tests and waiting) |
| severity decides rounds | 5 | rounds 3+ = 28% |
| lean briefs, small rules file | 10 | 9% + 14% |
| one stack script | 11 | 6% |
| machine budget, heavy-agent cap | 13 | 9 agents: kills and re-runs of everything |
| housekeeping by the lead | 20 | disk 3.9 GB to 9.5 GB free after one sweep |
| tiers and bundles | 1, 3, 5, 7, 10 | 41% of tasks needed 2+ rounds = 78% of task tokens; fixed start 33% of a builder's steps |

## Tier figures (proposal 17 Oct 2026, recalibrate with spend.py)
| tier | runs per task | tokens per task | made of |
|---|---|---|---|
| T0 lean | 1 | 3M | one builder run, no verifier |
| T1 plain | 2.3 | 17.5M | 12M builder, 4M lean verifier, 30% chance of a 5M patch round |
| T2 money and identity | 2.5 | 38M | 20M builder, 12M full verifier, 50% chance of a 12M fix round |
A task in a bundle pays about x0.8 (the fixed start is paid once per bundle). Before tiers a task cost 3.45 runs and
53.6M tokens on average (since 16 Oct); projected remaining work fell from about 279 runs and 4.9B tokens to about 74 runs
and 1.5B. Burn at a full fleet was about 140M tokens and 10 runs an hour. These are proposals: replace them with your own
medians from `spend.py` after the first wave.

## Predict before you start
Cost of a task is about (steps) x (per-step price for that length) x (1 + rounds you expect). A T1 bundle with a 90-step
builder lands near $5; a lean check of 35 steps near $1.50. Multiply by tasks, by 0.8 for a bundle, and compare with the
plan window you looked up. Re-run `spend.py` after each wave and move the budgets, not the rules, when a bucket drifts.
