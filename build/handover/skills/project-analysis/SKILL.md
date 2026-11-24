---
name: project-analysis
description: 'Analyse a software project before it is built: inventory every feature from the sources (design canvas, brief, existing repos), split it into agent-sized tasks with tiers, bundles and dependencies, cost it on the tiered workflow in API dollars and in subscription plans (e.g. Claude Max 20x plan-weeks) with light / expected / heavy ranges, and give the duration two ways, dynamic (as fast as the plans allow) and fixed (what it takes to finish by a date). Ends in a visual owner page plus a tasks CSV and a numbers JSON. Use when someone asks to "analyse this project", "scope this app", "split it into tasks", "how much will it cost", "how many subscriptions", "how long will it take", "can we finish by a date", "plan the build", or hands over a design bundle, brief or repo to estimate. Do not use to run the build itself (build-orchestration does that) or to audit a built app (qa-audit).'
---

# Project analysis

Turn a project (a brief, a design canvas, existing repos) into a plan the owner can act on: what will be built, in which tasks, at what cost, in how long, and what only the owner can do. The method was used for the WAWU and Voices builds (Oct 2026); its constants are measured there and must be recalibrated after the first week of any new build.

## Rules

1. **Sources first, code second.** Features come from the brief, the design canvas and the owner's words. Existing code tells you what is already built, never what is wanted. Read every artboard, not a sample.
2. **Coverage both ways.** Every source feature maps to at least one task; every task maps back to a source feature or a stated need (setup, gates, release). List what maps nowhere: that is where scope hides.
3. **Measured, not guessed.** Every constant in the cost model has a source (references/cost-model.md). Say which numbers are measured and which are assumed. Never invent a price, a fee, or a provider's capability: ask or mark it unknown.
4. **Decisions belong to the owner.** List the product decisions the plan depends on (money rules, splits, providers, legal, what is in launch). Give each a recommended default so the plan can proceed, and mark the ones that change the cost.
5. **Money cannot buy everything.** Keys, accounts, store reviews, legal sign-off, provider onboarding, content and approvals are owner items with their own waits. List them apart from the cost; they often set the real date.
6. **The page is visual.** The owner reads the page, not a report: counts, bars, a timeline, a three-column budget, short labels. No paragraphs. Use the project's own design if it has one.

## Steps

### 1. Read and inventory
- Read the brief, every design artboard (both themes), every existing repo's README, routes and data model, and any rulings file.
- Write the feature inventory: area, feature, source (artboard id or brief line), status (new, exists, exists but must change, cut).
- Note contradictions between sources and list them as owner decisions.

### 2. Split into tasks
One task is one reviewable change. The plan assumes the tiered workflow (build-orchestration): effort matched to risk, related tasks bundled, only affected tests per task, full suites in CI and once per batch, at most 2 fix rounds. Rules:
- **Tier**, by risk (it sets the cost):
  - **T0 lean**: copy, records, config rows, test-only, generated files. One run, no verifier agent (the lead reads the diff), no rounds.
  - **T1 plain**: screens and endpoints with no money or identity, removals, sweeps. One builder, a lean verifier, a patch round only for medium or worse.
  - **T2 money and identity**: anything that moves, holds or shows money; auth, KYC, deletes, migrations on money tables, third-party providers. Full verifier with money attacks, a local stack, every drawn state of a pay screen.
  - A task that touches money is T2 whatever its size.
- **Size**: **S** (a copy line, one state, one small endpoint), **M** (a screen with its states, an endpoint with its rules and tests), **L** (rare: split it into M tasks wherever the split leaves reviewable pieces).
- **Bundle**: 2 to 5 tasks of one area and repo pair that share a pattern or screen group get one bundle id. One builder and one verifier take the bundle; a bundled task costs 80%. Never put T0 work in a T1 or T2 bundle.
- **Kind**: design, backend, app, web, admin, qa, ops, release.
- **Dependencies**: list what must exist first (schema before endpoint, endpoint before screen, provider sandbox before money flows). Keep the chains short; a chain is the one thing more plans cannot speed up.
- **Always include**: repo and CI on every push, gates (a verification harness), a local test stack, the provider sandboxes, design QA passes, checkpoint audits by agents that built nothing, sweeps for the low findings, store builds and submissions, and a records pass. The 20% found work is added by the model; do not pad tasks.
- Order money and identity core first (they carry the most rounds), then the screens that depend on them.
- Write `tasks.csv` (template in assets/templates/tasks.csv): `id,area,title,size,kind,tier,bundle,depends_on,source,wait_days`.
- Owner items go in the same CSV with kind `owner`, size empty, and a `wait_days` estimate; they are not costed.

### 3. Cost
Run `python3 scripts/estimate.py --tasks tasks.csv --out plan-data.json` (add `--params params.json` to override constants, `--plans N` for a given number of subscriptions, `--deadline-days N` for the fixed-duration case). It stops with PROBLEMS when a size, tier, dependency or bundle is wrong.
- Per task by tier, fix rounds included: T0 3M tokens and 1 run; T1 17.5M and 2.3 runs; T2 38M and 2.5 runs; times the size factor (S 0.6, M 1, L 1.8) and 0.8 when bundled.
- Plus one merge run per 6 tasks (15M: the full suites once per batch), 20% found work and 18% lead.
- Tokens to dollars at the measured $0.214 per million agent tokens; ranges light 0.7x, expected 1x, heavy 1.4x.
- In plans: dollars / plan-week capacity (one Max 20x plan carried about $2,300 of API-priced work a week) = plan-weeks; monthly price and local currency from params.
- Pay-as-you-go: the same total in API dollars.

### 4. Duration, two ways
- **Dynamic** (the default): with N plans, the longest of (a) **plan capacity**: a plan's week can be spent as fast as the fleet burns it, then the fleet waits for the reset, so it binds only past one plan-week per plan; (b) **fleet throughput**: tokens / the full-fleet burn (140M an hour at 8 agents), plus 25% margin, at a 60% duty cycle; (c) the **critical path**: the longest dependency chain, each link its task hours plus an hour of CI and merge at 16 chain hours a day, plus the owner waits on it. Report which one binds and the days under each.
- **Fixed** (a date is given): the plans needed so the plan-weeks that start before the date cover the spend, and whether the critical path and throughput fit at all. If they do not, say what to cut or what the owner must do sooner; more plans cannot shorten a chain or an owner wait.
- Measured truth from the WAWU build: the fleet stood idle 65% of the time, mostly because the plan-week ran out, plus restarts and nights. With the tiered workflow the spend drops about 3 times, so the chain and the owner waits bind more often.

### 5. The owner page
Sections, in this order (assets/templates/plan-page-outline.md has the details):
1. **The answer**: cost (expected, with light and heavy), duration (dynamic), plans needed, one line each.
2. **The count**: features to tasks; tasks by size and tier.
3. **By area**: a bar per area with task count and cost.
4. **Timeline**: weeks across, areas down, the critical path marked.
5. **Budget**: light / expected / heavy columns, in dollars, plans and local currency; pay-as-you-go beside it.
6. **Fixed date** (if asked): plans needed for the date, feasible or not and why.
7. **Only you**: the owner items with their waits.
8. **Decisions**: each with the recommended default and whether it moves the cost.
9. **All tasks**: a compact table (collapsible).
Publish it as an artifact and give the link; attach the CSV and JSON.

### 6. Recalibrate after week 1
Measure real spend per task from the build's transcripts (build-orchestration's spend script), the first-round pass rate and the runs per task; update the params and re-run the estimate. Tell the owner the new numbers on the same page.

## Pitfalls (from the WAWU build)
- Rounds drive cost: 41% of tasks needed 2 or more rounds and took 78% of task tokens; the first-round pass rate was 58%. Keep tasks small, give builders exact briefs, cap rounds at 2.
- Steps drive spend: every step re-reads the whole context. Polling CI, broad searches and full test suites inside agents burn the plan; the tiered workflow keeps them in CI and the batch merge.
- Costing every task at the heavy rate is the old mistake: a copy change with a builder, a full app check, a verifier and its own merge cost as much as a screen. Tier and bundle first, then cost.
- Website, dashboard and app counts drift apart; count each surface once, from the source.
- Owner items stall the fleet: ask for keys, accounts and store access on day one.
