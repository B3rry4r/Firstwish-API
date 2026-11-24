---
name: build-orchestration
description: 'Run a multi-agent software build as a cost-controlled orchestrator: one lead session orchestrates, rules and merges and writes no task code; cheaper-model agents build; a separate verifier checks everything above the lean tier. Work is cut into effort tiers (T0 lean, T1 plain, T2 money and identity) and bundles of 2 to 5 tasks, with lean briefs, step budgets, quiet logs, a machine budget with housekeeping, affected tests only (full suites in CI), batch merges by PR, a migration stamp registry, spend from transcripts, visual owner pages. Use for "run this build with agents", "orchestrate the builders", "dispatch the tasks", "the agents are burning my plan", "merge the agent branches". Not for what to build, how to check it, or what it will cost and how long: contract-driven-backend, admin-surface-extension, design-change-adoption, design-canvas-port, frontend-surface-build, legacy-app-repair, verification-harness, qa-audit, project-analysis. For a live system with paying users use live-system-change.'
---

# Build Orchestration

Run a build with many agents so that it costs a fifth of what it would, and so that checking is independent of
building. The lead is the expensive session. It decides, rules, merges and waits. It never writes task code. Cheap
agents build and a different cheap agent checks. Everything else in this skill is a consequence of one measured fact:
**cost is steps times context**, because every step re-reads everything already said.

Measured on the WAWU build (also called WMT; four repos, one live with paying users): the first 126 agent runs (10 to 14
Oct 2026) cost agents $1,936, lead $177; 57 runs went past 200 steps and were 73% of the spend; cache reads were 79%. See
`references/costs.md` and `assets/scripts/spend.py`. Over 10 to 17 Oct (419 runs) came the reason for tiers and bundles:
41% of tasks needed 2 or more rounds and took 78% of task tokens; the fleet stood idle 65% of the time on the plan-week;
projected remaining work fell from about 279 runs and 4.9B tokens to about 74 runs and 1.5B.

## Files and when to read them

- `assets/templates/COMMON-RULES.md`: the shared rules, 40 lines or fewer. Fill it once.
- `assets/templates/BUILDER-BRIEF.md` and `VERIFIER-BRIEF.md`: tier-aware, 25 lines or fewer; one per bundle and round.
- `assets/scripts/wait_ci.sh`, `wait_pr.sh`, `wait_deploy.sh`: the lead's watchers (no model, no tokens).
- `assets/scripts/spend.py`: cost per agent, by length, round and idle lapse, from the transcripts.
- `references/costs.md`: the measured numbers (A1 to A11) and the tier figures. Read when setting budgets.
- `references/machine.md`: machine budget (section 0), worktrees, ports, databases, caches, PIDs, memory, housekeeping
  (section 11). Read before wave 1.

## Core laws

Each law carries its measurement or incident; the ids (A1, B2 ...) are used in `references/`.

1. **The lead orchestrates, rules and merges. It writes no task code.** The lead is the dearest model and the longest
   context. Its $177 was 8% of the total; code it writes would be the most expensive code in the build and would crowd
   out its decisions. A mechanical act (rename a migration, open a PR, post a comment) is not task code. The lead
   also stops: hand-editing boards (generate them; 517 steps, 18% of its work), polling CI, reading full verifier
   reports (the hand-back carries severities), and mid-run messages (a brief that names its defaults needs none).
2. **Every agent runs on the cheaper model, set on every spawn.** An unset model inherits the lead's. Fleets of dear
   agents burned a plan in two days (A10). A resumed agent keeps its model, so a dear agent is never resumed: start a
   fresh cheap one that picks up the saved branch.
3. **The builder never verifies its own work.** Above T0 a separate verifier checks the bundle (lean at T1, full at T2).
   At T0 (copy, records, config) the lead reads the diff and the test line instead; there is nothing for an attack to
   find. Verifiers caught 2 blockers (two deletes freed extra places; erasing an account kept its phone verified), 1
   high and several mediums that green tests missed (B1). A payment page merged unchecked "for speed" ran 13 px past
   every phone for 2 days (B2): that is T2 work.
4. **A builder's report is a list of claims to test, not facts.** The verifier brief lists the claims, says "test, do
   not trust", and compares with main: a failure also on main is pre-existing and reported apart (B9, B4).
5. **Severity decides rounds, and rounds are capped.** Blocker, high, medium: a fix round. Low: a sweep row, never a
   round. At most 2 rounds, then the lead rules (accept with a sweep row) or re-cuts; a third round is a re-cut. A fix
   of 30 lines or fewer closing named findings may be accepted on the lead's diff read, with no verifier re-check.
   Rounds 1/2/3/4+ were 50/22/11/17% of spend; one task reached round 6 and cost $201 (A4).
6. **Quiet output.** Every command that can print much writes its full output to a log and prints
   `tail -n 15`. Read failures with `grep -m 20`, files by line range, diffs by `--stat` first (A1).
7. **Every brief carries a tier and a step budget** (table in mechanics section 1). At the budget the agent finishes,
   pushes and hands back what remains. Per step: $0.038 under 100 steps, $0.062 at 100 to 199, $0.092 at 200 to 299,
   $0.098 at 300+ (A1). Budgets are starting points: move them with `spend.py`.
8. **No agent idles more than 4 minutes.** The prompt cache lapses at 5; after that the whole context is written
   again at the dear rate: 314 times, $275, 14% of agent spend (A2). Agents look again within 4 minutes. The lead waits
   with shell scripts.
9. **Agents run only the affected tests; CI runs the full suites; no agent waits on CI.** Affected specs, typecheck and
   lint on changed files, each in a quiet log gated on its EXIT line. The full backend suite runs in CI on every push;
   the full app suite runs once per batch, by the merge agent. The agent pushes and hands back with head shas. The lead
   (or a watcher script) reads the run once and sends the agent back only if it is red; a verifier PASS needs the head's
   run green, and the lead checks that. Full suites per agent were 45% of spend (A3); three deploys were stopped by a
   suite that only ran after merge (B3).
10. **Briefs are lean**: from templates, 25 lines or fewer, no rule text, no history; the shared rules file 40 lines or
    fewer; hand-backs 10 lines (builder) and 20 (verifier), severities not full reports. A brief is never appended to;
    findings go in a separate small file. A lean payment-path task cost $28 against $93 to $201 for comparable ones
    (A7). Task files that grew to 50 to 73k tokens cost 9% of spend (A5); the fixed start context was 14% (A8).
11. **One stack script, built once.** No agent hand-builds a server, stand-in, database or web build (6% of spend,
    plus rebuilds after setup mistakes) (A6). T2 bundles use the stack; T1 only when a seam is claimed, once per bundle.
12. **Shared-machine hygiene.** A detached worktree, port block, database prefix, cache dir and browser profile per
    agent, named in the brief. Kill by PID, never `pkill`; leave nothing running (D1 to D4, `references/machine.md`).
13. **Machine budget: measure the machine first, then size the fleet.** At the start the lead records CPUs (`nproc`),
    available memory (`free -g`), free disk (`df -h` on the work and temp folders) and any per-session disk allowance,
    and writes them into the common rules. The heavy-agent cap is `min(CPUs + 1, available GB / 2.5)`, rounded down;
    a heavy agent runs servers, suites, builds or exports, text-only agents do not count. WMT: 9 heavy agents on 4 CPUs
    and 15 GB caused out-of-memory kills, flaky timing tests and re-runs (A9); drop the cap by one after any memory
    kill. Every brief carries the machine line and the guard (a heavy job only at 5 GB available, else look again
    within 4 minutes). Disks fill too: about 600 MB was left once (law 20). Details: `references/machine.md` section 0.
14. **Gate every push on the check log's own last line** (`EXIT 0`), never on a background job's exit code (D5).
15. **Merge in batches by PR, with the gate comparison, and watch the deploy.** Protected suite green, merge commit, a
    PR comment stating the gate comparison against main, deploy watched to "success" and the health endpoint. Gates
    already fail on main (16 FAIL lines in WAWU): the test is "the same FAIL lines as main", never zero (B5, D6, D7).
16. **Quote the owner's words in the brief. Never claim what you cannot see. Owner questions only in six cases:** (1) a
    money figure the sources do not give; (2) a legal, licence or brand word; (3) a key, account or live number only the
    owner holds; (4) a destructive change to real money or data; (5) ledger and provider disagreeing; (6) changing a
    rule the owner made. Everything else the lead defaults: pick what the design, facts or safest behaviour give, record
    "Default (lead), owner may override" in the task's Current state, continue. Defaults are listed to the owner, never
    asked. A phrase that reads two ways is case 6 when either reading changes an owner rule ("other parts of the site
    should not show" also hid the landing page, B6), otherwise a default. A number an agent had to invent is marked
    PROVISIONAL with an owner (B8). Rulings are recorded with who and when and outrank code comments (E3).
17. **Owner pages are visual and show only what is built** (steppers, boards, bars, timelines; short labels; the
    brand's design; no paragraphs). A part of a screen whose task is not complete is not drawn: no do-nothing button, no
    placeholder row (E1, E2). Generated from `status.json`, never hand-edited.
18. **Agents never call a live provider or a production host.** They use the repo's stand-ins or the provider's sandbox.
    The lead alone makes one read-only live check after deploy. What was not run against the real thing is reported
    "NOT RUN against the real provider: why" (C9, E5).
19. **Measure, then adjust.** Run `spend.py` after each wave and move budgets, not rules. Look plan sizes up, never
    assume them: the $200 plan's 5-hour window was 4x the $100 plan's, its weekly allowance only 1.7x (A11).
20. **Housekeeping is the orchestrator's job.** The lead keeps the box healthy; agents clean only their own worktree.
    Triggers: after every batch, at least every few hours, and at once when free disk is under about 20% or 5 GB or
    available memory is under 5 GB. Steps: `df -h`, `free -g`, a process list; remove the worktrees and scratch folders of
    merged or abandoned tasks (`git worktree remove`, then `git worktree prune`); delete large leftovers (build outputs,
    videos, old logs); stop orphan servers by PID once no running agent owns them; log what was removed. Never delete a
    folder a running agent uses or evidence an open task still cites, and launch no new heavy agent while under the line.
    WMT: clearing 108 stale folders took free disk from 3.9 GB to 9.5 GB. A task found obsolete mid-build is stopped at
    once. Details: `references/machine.md` section 11.

## The mechanics, end to end

### 0. Set up once, before wave 1
1. A scratch folder: `prompts/` (briefs), `verify/` (verifier files), `logs/`, `stacks/`, `sweeps/<area>.md`,
   `ALLOC.md` (slot, task, branch, ports, db prefix, stamp), `STAMPS.md`, `status.json` (the board, generated).
2. Copy `COMMON-RULES.md` to `prompts/common-rules.md` and fill it. Copy both briefs to `prompts/`.
3. Measure the machine (law 13): `nproc`, `free -g`, `df -h <work> <tmp>`, any disk allowance. Write the machine line
   and the heavy-agent cap into `common-rules.md`; copy the line into every brief.
4. Build the stack script (`references/machine.md` section 7) and make CI run on every work-branch push: full backend
   suite, gates, baseline, protected routes, contract build. Where CI cannot run, say so in the brief and let the merge
   agent run the full check once per batch with two workers.
5. Record main's gate FAIL lines (`main-fails.txt`, keys without line numbers). The baseline is the lead's alone.
6. Look up the plan windows and the dear/cheap model prices; put them in `spend/plan.md` (law 19).
7. Task files live in the repo, not only in scratch: owner's words, cases, file map, out of scope, how to verify,
   and a Current state of at most 30 lines. History goes to a log nobody is told to read.

### 1. Cut tasks into tiers and bundles
One task is one reviewable PR. Order by dependency, the thing others stand on first (WAWU built the money core before
anything that moves money). Set the **tier** when the task is cut, from its risk, and write it in the brief's first line:

| tier | what | builder | checks | verifier |
|---|---|---|---|---|
| T0 lean | copy, records, config, test-only, generated files | one run, ~25 steps | affected tests, typecheck | none: the lead reads the diff; no rounds (a wrong line is a new T0) |
| T1 plain | screens and endpoints with no money or identity, removals, sweeps | one per bundle, ~90 (+30 per extra task) | affected tests, typecheck, lint on changed files; pictures only for screens (one light/dark pair) | lean, ~35 (+10): claims, affected tests, pictures, every drawn state |
| T2 money and identity | money paths, auth, KYC, deletes, migrations on money tables, third parties | one per bundle, ~130 (+40) | as T1, plus a local stack and every drawn state of a pay screen | full, ~90 (+20): the money attacks, the stack |

**Bundles:** 2 to 5 tasks of one area and repo pair, one brief, one branch (named after the first task; commits name
every id), one verifier reading the claims as one list. The fixed start (rules, brief, files, worktree, stack) is paid
once. Never mix T0 upward: T0 work stays in T0 runs. Anything the owner has not ruled follows law 16.

### 2. Write the brief
Fill `BUILDER-BRIEF.md` from the template, 25 lines or fewer: tier, the bundle's tasks, budgets, ports and stack name,
the owner's quote, the cases (input and expected result), the file map, out of scope, branch, stamp, and what to read
(each task's Current state only). No rule text and no history. A patch brief (fix round) quotes only the finding ids.

### 3. Spawn
- Set the cheaper model. Label the agent `Build BUNDLE-P1` or `Verify BUNDLE-P1 round 2`: `spend.py` groups by label.
- The spawn message is one line pointing at the brief file. Run it in the background.
- Keep ready bundles two waves deep so slots never wait on briefs. Heavy agents at most the law 13 cap at once; the rest
  queue in `ALLOC.md`. Text-only agents are free.

### 4. While it runs
The lead does not poll with steps. It starts a watcher in the background with output to a log
(`wait_ci.sh <repo> <sha> <min_runs> <max_min>`) and reads it once, when it ends. It sends no mid-run messages.

### 5. Read the hand-back (10 lines)
Confirm the branch head on origin (`git ls-remote`). Read the builder's check log EXIT line, not its prose, and the CI
run once. Red CI caused by the change goes back as a small patch; gate FAIL lines that main also has do not. T0: read
the diff and the test line, then on to the next batch. Otherwise the claims go to the verifier unedited.

### 6. Verify
Fill `VERIFIER-BRIEF.md`: claims one per line, the base ref, the attacks for the tier, the budget. T1 lean: claims,
affected tests, pictures beside the design, every drawn state, nothing drawn that is not built. T2 full: parallel
requests, double submit, replay and forged webhooks, wrong role, old-shape input, erase paths, ledger equals provider,
on the stack. The verifier writes one file of 40 lines or fewer and hands back in at most 20: the lead reads the
severities, never the transcript.

### 7. Fix rounds and sweeps
| finding | action |
|---|---|
| blocker, high, medium | patch brief naming the finding ids (T1 ~25 steps, T2 ~40), then the verifier re-checks those ids (~15 steps) |
| low | one line in `sweeps/<area>.md` (file:line, what) |
| pre-existing and users hit it | its own small task |
| pre-existing and nobody hits it | sweep list |
After round 2 the lead rules (accept with a sweep row) or re-cuts the task; there is no round 3. A fix of 30 lines or
fewer closing named findings is accepted on the lead's diff read. When an area's list reaches about 8 lows, or before a
release, run one sweep bundle (T1) with the lows as its cases.

### 8. Merge in batches
A batch opens at 6 checked tasks or 6 hours since the last, whichever first; money (T2) first in the stack; one PR at
a time on the previous head. A merge agent (one T1 run) does the stack, migration stamps, contract regeneration and
the full app check once on the batch head (`--maxWorkers=2`). The lead alone then:
1. Opens the PR: task ids, claims, verifier files.
2. `wait_ci.sh` for the head, `wait_pr.sh <repo> <pr> "<protected suite name>"` for the protected suite.
3. Gate comparison: run the gates on the head, compare the FAIL keys with `main-fails.txt`. Any new key blocks.
   Comment: "gates: same N FAIL as main; protected suite green; CI run <id>; verdict merge (<files>)".
4. Merge commit. No squash, rebase or force-push.
5. `wait_deploy.sh <repo> <sha> "<deploy workflow>" <health url>`; then, for a live system, the lead's single read-only
   check (a public GET, a page render, never a write or a payment). Server first, clients after. A failed deploy stops
   all other merges until a small hotfix task fixes it (B3).
6. Free the slots in `ALLOC.md`, remove the worktrees, regenerate the board, run housekeeping (law 20).

### 9. Migration stamp registry
`STAMPS.md` lists stamp, task, branch, state (reserved, in review, merged as <name>). Each task gets a unique stamp
ahead of main's last migration, spaced by slot, so branches built in parallel never collide. In the batch the merge
agent renames the branch's migration folder so it sorts after main's current last (`ls migrations | sort | tail -n 2`),
edits the registry, and pushes, so CI proves the order. The rename is mechanical, not task code. A conflict in real
code goes back to the builder as a patch. A merged migration is never edited.

### 10. Measure
```
python3 assets/scripts/spend.py --dir <session>/subagents --lead <session>.jsonl --since 2026-10-10 --until 2026-10-14
```
Read five things: cost by length (is the 200+ bucket large: cut budgets), by round (is round 3+ large: tighten
severity), idle lapses (find who waited), median builder and verifier cost per tier (a T1 verifier above its budget:
leaner brief), and top tasks. Save the output as `spend/wave-N.txt`. Prices are an input: pass `--prices`.

### 11. Owner pages and status
One short status line while work runs; never a fabricated result; say what was not run. For the owner a page, not a
write-up: a stepper per task (Brief, Build, CI, Verify, Merge, Deploy), a board of columns, bars for tasks done and spend
against the plan window, a timeline. Short labels, the brand's design system, dark first, only what is built. Generate
it from `status.json` by script after each batch.

### 12. The owner's words
Record every ruling in the repo's rulings file: the exact words, who, when, what it covers, what it does not. The brief
quotes it; law 16 says which phrases are asked. Standing owner rules go in `common-rules.md` under "Owner rules".

### 13. After a restart
Scratch, worktrees and databases may be gone; origin branches are the truth. Restart the database server, rebuild the
dependency copy, rewrite `ALLOC.md`, and brief continuing work with "start from the branch on origin"
(`references/machine.md` section 10).

## Halt conditions (stop; the six owner cases of law 16 go to the owner, the rest the lead rules)

- An owner phrase that reads two ways where either reading changes an owner rule.
- An agent wants to edit a gate, a test it did not write or a baseline to pass, or to run a destructive git command.
- Any agent touched a live provider, a production host or real customer data.
- A new gate FAIL key versus main that the builder cannot explain, or a deploy that failed after merge.
- A medium finding survives round 2: not a third round; the lead accepts it with a sweep row or re-cuts the task.
- Spend is on course to pass the plan window you looked up, or a bucket in `spend.py` doubled between waves.
- Repeated out-of-memory kills: lower the heavy-agent cap by one before running anything again.
- Disk nearly full (the WMT box once had about 600 MB free) or memory under 5 GB: stop spawning heavy agents and run
  housekeeping first (law 20, `references/machine.md` section 11).
- A fee, price, limit or legal figure appears that nobody with authority supplied (cases 1 and 2).

## Structure

```
build-orchestration/
  SKILL.md
  assets/
    templates/
      COMMON-RULES.md     the shared rules, 40 lines or fewer
      BUILDER-BRIEF.md    tier-aware brief, 25 lines or fewer, patch variant at the bottom
      VERIFIER-BRIEF.md   claims to test, attacks by tier, verdict file
    scripts/
      wait_ci.sh          wait for every check run on a commit; last line CI GREEN / CI RED / CI TIMEOUT
      wait_pr.sh          wait for one named check on a PR head (the protected suite)
      wait_deploy.sh      wait for the deploy run, then read-only GETs on health URLs
      spend.py            transcripts to cost by agent, length, round, idle lapse, task
  references/
    costs.md              the measured numbers A1 to A11, tier figures, and how to predict a bill
    machine.md            machine budget, worktrees, PIDs, ports, caches, stack script, restarts, housekeeping
```
