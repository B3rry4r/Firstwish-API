---
name: frontend-surface-build
description: Build or repair a frontend surface (web app, admin dashboard, marketing site) against a known API contract, using strictly-scoped sub-agents and MEASURED evidence rather than visual self-assessment. Use this skill whenever the user wants screens built or wired from designs, a UI audited against its design system, product-copy or brand rules enforced, desktop/responsive layout problems fixed, interaction states (hover/focus/disabled) audited, or a dashboard/app frontend brought to shippable quality. Trigger on phrases like "build the dashboard UI", "wire these screens", "the desktop layout is broken", "buttons do nothing on hover", "it looks like a stretched mobile view", "audit the frontend", "match the design". Do NOT use for backend/API generation; use contract-driven-backend or admin-surface-extension for that. Do NOT let an agent declare a screen done by looking at the code.
---

# Frontend Surface Build

Build and verify frontend surfaces with sub-agents that each own one screen,
and gate every claim on something **measured in a browser** rather than
reasoned about in a diff.

This skill exists because of a repeated failure: a frontend can pass typecheck,
lint and its own tests, and match its design in the code, while being visibly
broken to the person using it. Every law below is a scar.

Phase 0 installs `verification-harness` and the pipeline runs it at every phase
boundary. Every law below was written down correctly before, and ignored once
by a model deep into a build that wanted to finish. A law that is not an exit
code is not a law: the prose stays because it explains *why*, but where a gate
exists, the gate is what holds.

## Core laws (never violate these)

1. **One agent, one scope.** A sub-agent owns one route or component family,
   or one bundle of 2 to 5 of them from one area, and never edits outside it.
   Concurrent agents get **file-disjoint** scopes; where two need the same shared component, one owns it and the other
   files a request. Overlapping writes silently clobber.
2. **Measured, not eyeballed, and nothing certifies its own work.** Any claim
   about layout, colour, contrast, spacing or interaction is verified by
   rendering the page and reading computed values. "It looks right" and "the
   class is there" are not evidence (law 6). This holds hardest for "done": an
   agent that just wrote a screen is the worst judge of it. (Observed: 188
   screenshots and a per-screen "matches the artboard" claim, every one
   produced by the agent that wrote the screen; the owner found ten defects in
   an hour.) Agents self-report progress; **a separate agent verifies every
   T1 and T2 bundle** (see Verify; T0 gets the lead's diff read). The only
   user-facing bug that went live in a 15-day build came from a payment page
   merged without a verifier "for speed".
3. **Never fork a component.** If a screen needs a variant, add a prop. A
   second copy is a second truth that drifts. (Observed: a forked `ErrorState`
   defaulting to "check your connection", so a 403 told every user their
   network had failed.)
4. **Never invent a wire shape.** Types come from the API contract, generated
   or imported, never hand-written. (Observed: a client typed `{items}` against
   an endpoint that returns a bare array.)
5. **Product invariants are executable.** Brand and product rules (banned
   words, currency, forbidden concepts, units) go in a repo check that runs in
   CI, never a human sweep. (Observed: a banned word swept clean, then
   reintroduced in five places later the same session.)
6. **The cascade is empirical.** Specificity, inheritance and utility ordering
   are verified against the BUILT stylesheet in a real browser. (Observed: a
   global `a:hover` outweighing every Tailwind text-colour utility, and a first
   fix that silently disabled every deliberate text hover in the app.)
7. **Every interactive element is interactive.** Hover, focus-visible, active
   and disabled are a checklist per control type, verified by measurement.
   (Observed: 103 of 114 buttons with no hover state, and no `cursor: pointer`
   anywhere in the app.)
8. **Real viewports, narrowest first.** Worst case = the narrowest supported
   width of the product's primary device. Where phones are primary, measure
   `phone-min` 360 x 740 first, then 390; otherwise the smallest supported
   desktop. On every page that takes money or input,
   `documentElement.scrollWidth <= innerWidth` at 360 and 390, and overflow is
   a **blocker**. (Observed: a payment page ran 13 px past every phone for
   about 2 days because nothing checked phone width first; and "it looks like
   a stretched mobile view" five times, each fix checked at a width where it
   already looked fine.)
9. **A screen is done when it renders, not when it compiles.** Done = the
   route loads with zero console errors, real data visible, every built state
   reachable.
10. **Report what you measured.** Numbers (widths, ratios, counts), not
    adjectives. "Back control centre was 4px above the title baseline on 6
    routes, now 0" is a report; "fixed the alignment" is not.
11. **Kill every process you start, by PID.** Dev servers, browsers, file
    servers. Never `pkill`, `killall` or `pgrep -f`: on a shared machine they
    kill other agents' work. Before hand-back, `ss -ltnp` on your ports shows
    nothing of yours. Leaked servers from finished agents (a 5GB dev server and
    a Chrome fleet, alive eleven hours later) starved a machine until `npm`
    could not fork: an environment failure wearing a code failure's costume.
12. **The artboard depicts one moment; the code path serves several.** Before
    removing an element the design omits, ask what other actor or state this
    path serves. (Observed: "Create an account" deleted as undrawn because the
    artboard drew a returning user, stranding every first-time user.) The same
    path must render a drawn success as pending and as failed.
13. **A confident technical justification in a diff is a claim to verify.**
    (Observed: a circle shipped where the design specified an oval, defended
    as "reshaping risks the FittedBox-cover math", which was untrue.) Treat
    rationale text like any unmeasured claim under law 2.

## Pipeline artifacts (`.pipeline-ui/` at the frontend repo root)

```
.pipeline-ui/
├── surface-map.json      # Phase 1: routes, shared components, design sources, breakpoints
├── contract-types/       # Phase 2: types generated FROM the API contract (law 4)
├── screen-tasks/<route>.json  # Phase 3: per-screen work: wire, states, alignment
├── invariants.md         # Phase 0: product/brand rules, each with its executable check
├── measurements/         # Phase 5: raw measured output per route per viewport
│   └── <route>@<width>.json
├── defects.json          # Any phase: observed, classified, owner (this pipeline or upstream)
├── decisions.json        # Autonomous rulings with confidence (see Autonomous mode)
└── REVIEW.md             # Final, for the owner: a visual board (low-confidence calls first, screenshots), short labels
```

## Phase 0: Invariants and reference (once)

Write `invariants.md`: the product rules a screen can violate silently, each
with **the executable check that enforces it**, not just prose. Categories
(probed, not waited for): banned vocabulary with its approved replacement;
currency and units (one currency, its formatter, minor units); forbidden
concepts (an icon is copy); counted vs valued (a count never rendered as
money); design tokens (no hardcoded hex, spacing, radius); component ownership
(forks are a build failure). Ship the checks as a repo script wired to an npm
script (law 5).

Also record: the **reference design** location, the **breakpoint table**, the
**primary device**, and the **narrowest supported width** (law 8).

## Phase 1: Surface map (1 agent)

One agent inventories the repo into `surface-map.json`: every route and its
files; shared components with their real call sites; design sources and the
route each frame matches; breakpoints as actually configured (read the config,
never assume framework defaults); the data layer and where types come from.
**The inventory is not routes alone**: modal sheets, drawers and other
interaction-gated surfaces a router crawl cannot see are listed with how to
reach them, or the map says so. (Observed: a screenshot harness reported "75
screens, 0 unrenderable" while the buy/sell and funding journeys, a third of
the product, were modal sheets and not in the denominator at all.)

It also runs the greppable mechanical sweeps up front: **fork detection** (one
component name exported from two files; two declarations of one type; two
lookup tables for one enum); **hand-typed wire shapes** (response interfaces in
component or page files); **interaction-state census** (every interactive
element and whether it declares hover/focus/active; output the count, not a
sample); **invariant violations** (the Phase 0 script).

## Phase 2: Contract types (1 agent, before any screen work)

Generate or import types from the API contract into `contract-types/`. Every
screen agent imports these and may not declare a response shape. If the
contract is a frozen registry from a backend pipeline, generate from it
directly.

## Phase 3: Per-screen tasks (mechanical)

Derive `screen-tasks/<route>.json` from the surface map, design sources and
contract:
- `wire`: surfaces needing real data
- `state`: loading / empty / error / permission states designed or required
  but not reachable (each records **the condition that enters it**)
- `role`: for each control, which roles may use it. A control shown to a role
  that cannot use it (create and edit controls on a read-only admin) is dead
- `interaction`: controls missing hover/focus/active/disabled
- `layout`: routes to measure at each breakpoint
- `invariant`: violations from the Phase 0 script

## Phase 4: Build (file-disjoint agents, one per bundle of screens)

Each agent receives its route's files, the contract types, `invariants.md`,
the design reference for its frame, and the shared-component inventory
(import-only: it files a request instead of editing a shared component).
**Shared-component changes are serialised**: one agent adds the prop first,
the rest consume it (law 1). Run agents under "Parallel agents" below.

**Tiers and bundles.** Run the fleet per build-orchestration's tiers; the tier is set when the task is cut and is the brief's first line.
- **T0 lean** (copy, records, config, test-only, generated files): one run, ~25 steps, affected tests and typecheck, no verifier agent (the lead reads the diff), no rounds.
- **T1 plain** (screens with no money or identity, removals, sweeps): one builder per bundle of 2 to 5 screens of one area, ~90 steps (+30 per extra task); lean verifier ~35 (+10); pictures one light/dark pair per screen.
- **T2 money and identity** (pay screens, auth, KYC, deletes, third parties): builder ~130 (+40); full verifier ~90 (+20) with the money attacks, every drawn state of a pay screen, a local stack. Never mix T0 upward.
- **Rounds**: blocker, high and medium get a round; low goes to the area's sweep list. At most 2, then the lead rules (accept with a sweep row) or re-cuts; a fix of 30 lines or fewer closing named findings may be accepted on the lead's diff read. **Batches**: merge at 6 checked tasks or 6 hours, money first, one PR at a time.
- The lead stops: hand-editing boards (generate them), polling CI (a no-model watcher reads the run), reading full verifier reports, mid-run messages.

**Briefs and records.** A brief comes from the template (`references/briefs.md`), 25 lines or fewer: tier, bundle, file map, exact cases to test, step budget, no rule text or history; the shared rules file is 40 lines or fewer. Hand-backs: builder 10 lines, verifier 20 (severities, not full reports). Task files hold open findings only; round history goes to a log nobody is told to read (task files that grew to 50-73k tokens were 9% of one build's spend).

## Phase 5: Measure (browser) - MANDATORY

The phase that makes the rest true. Boot the app, drive a real browser, and
record to `measurements/`, **narrowest supported width first** (law 8):

1. **Layout**: bounding boxes of major blocks. Flag: a block wider than the
   readable maximum holding one short sentence; buttons stretched past a sane
   maximum; cards with extreme aspect ratios and little content; a grid track
   holding one item spanning the full row (`auto-fit` vs `auto-fill`); any
   horizontal overflow on the body.
2. **Header/chrome consistency**: title left edge, header height, back-control
   vertical centre against the title baseline, **compared across routes**.
   Divergence means several screens drew their own header; that IS the finding.
3. **Interaction states**: for every interactive element, does the computed
   background/colour change on hover, and by how much? Contrast between hover
   state and its surface below roughly 1.3:1 is invisible, a defect regardless
   of the class. Confirm the cursor and keyboard-reachable focus-visible.
4. **Cascade wins**: for rules the surface map flagged, read which rule wins in
   the built stylesheet (matched-rule order), not by inference.
5. **Text wrapping**: at the narrowest width, any single-line control whose
   text wraps.
6. **Screenshot** each changed screen into the review folder: one light/dark pair at the narrowest width (T2 pay screens: every drawn state); the once-per-batch sweep captures every route at every breakpoint.

**Scope.** A task agent measures the routes it changed plus the shared chrome.
One agent (the merge agent or CI) runs the full sweep, every route at every
breakpoint, once per batch; running it in every builder multiplies the cost for
no new evidence.
Print counts and `tail -n 15` of the log, never the raw measurements.

Automated checks catch crashes, emptiness and invisibility, not ugliness; the
screenshots are how a person catches the rest in one scroll. Every visual
defect that shipped in the source project (tofu-box glyphs from a missing font,
a doubled punctuation mark, a blank screen, hazard-stripe overflow) was caught
by a person looking at an image, none by an assertion. A count of screens
covered must confess what it could not reach (Phase 1).

## Phase 6: Exit checklist (dispatcher-run, mechanical)

1. Invariant script green.
2. Zero forks; zero hand-typed wire shapes.
3. Every interactive element has a measured, visible hover and a focus state.
4. Every route measured at every breakpoint, no flagged layout defect, no
   horizontal overflow at 360 and 390.
5. Every built state reachable, with its entering condition recorded.
6. Zero console errors on every route.
7. No do-nothing control and no placeholder row drawn; unbuilt parts are
   listed as blocked with the task that builds them.
8. Screenshots captured for human review.

## Ownership of cross-cutting rulings

A ruling that changes flow, ownership or scope needs an owner beyond the screen
it was raised on, or it is recorded and never executed (moving a step earlier
is a router change, outside every screen agent's scope).

1. **Every ruling names its executing pass when made**, in `decisions.json`, a
   defect entry or a Phase 3 task. A ruling naming no owner is a wish.
2. **A blocked task names the machine-checkable fact that unblocks it**:
   "blocked until `contract-types/Order.ts` exports `pin`", never "blocked on
   backend".
3. **A screen task that replaces one thing with another removes the old one,
   same pass, same commit.**

## Parallel agents: a worktree each

Each agent gets, named in its brief: its own detached git worktree, ports,
database prefix, browser profile and bundler cache dir. Boot the app with the
repo's one stack script, not a hand-built stack (hand-built stacks were 6% of
one build's spend, plus setup mistakes).

1. Never change a shared clone's branch. Never `git stash`, `reset --hard`,
   `checkout -- .`, `clean`, rebase, amend or force-push. (One stash captured
   95 files of four agents' work and a failed pop discarded it.)
2. Each builder commits and pushes its own branch; the lead merges by batch PR with
   the gate comparison in a comment. Compare an agent's reported file list with
   its pushed diff before trusting "done": a feature was once reported built
   and never committed.
3. Heavy agents (browser, dev server, full suite) are capped by the Machine
   budget below; the rest queue. Too many at once gave out-of-memory kills,
   flaky timing tests and re-runs.
4. Shared caches leak: a bundler cache once baked another agent's ports into a
   build. Use your own cache dir, and grep the build for `localhost:` ports
   before trusting a picture or a measurement.
5. Law 1's release valve stays ("one owns it, the other files a request"); a
   fence with no alternative makes two agents rebuild the same component.

### Cost rules (put at the head of every brief)

- Model: the dispatcher sets the cheaper model (Sonnet) on every spawn, never lets it inherit, never resumes an agent on a dearer model. The dispatcher orchestrates and merges and writes no task code.
- Output: send every test, build, server and long command to a log and print only `tail -n 15`, ending in `EXIT n` (`(cmd; echo "EXIT $?") > log 2>&1`). Read failures with `grep -m 20`. Gate on that EXIT line, never on a background job's code.
- Idle: never sit idle on a local job; look again within 4 minutes (the prompt cache lapses at 5 and the whole context is rewritten); wait in `timeout 230` loops, not one long sleep.
- Tests: only the affected specs (files you touched), plus typecheck and lint on changed files. The full suite runs in CI on every push; never wait on or poll it: push and hand back with head shas.
- Budget: the brief names the tier and step budget; at the budget, finish, push, hand back what remains in 10 lines.
- Machine: stop what you start by PID before hand-back.

### Machine budget (before you start agents, servers or builds on a shared machine)

- Measure first (`nproc`, `free -g`, `df -h` on the work and temp folders) and put the figures in every brief.
- Heavy agents (servers, suites, builds, exports): at most min(CPUs + 1, available GB / 2.5), rounded down, measured at the start (WMT: 4 CPUs and 15 GB held 3 to 6; 9 caused out-of-memory kills). Text-only agents do not count.
- Start a heavy job only when `free -g` shows at least 5 GB available; otherwise look again within 4 minutes. "Memory cgroup out of memory", a jest worker SIGKILL or a silent server death is memory, not code: wait, rerun.
- Check free disk before builds and exports; delete large outputs and stale worktrees when done. Run full suites in CI, not on the shared machine, wherever the repo allows.
- Housekeeping is the dispatcher's job, not only each agent's: after every merge, at least every few hours, and at once when free disk is under about 20% or 5 GB, or available memory under 5 GB. It is `df -h`, `free -g` and a process list; `git worktree remove` then `git worktree prune`, plus the scratch folders, for merged or abandoned tasks; deleting large leftovers (build outputs, videos, old logs); stopping orphan servers by PID once no running agent owns them.
- Never delete a folder a running agent uses, or evidence an open task still cites. While disk or memory is under the line, launch no new heavy agent.
- WMT example: 108 finished-task folders cleared, free disk 3.9 GB to 9.5 GB, 12 agents running.

### Verify: a separate agent per T1 or T2 bundle

The builder never verifies, and its hand-back lists its claims one per line, each testable. A verifier is a different agent: it tests those claims ("test, do not trust"), compares with the base branch (a failure also on base is pre-existing and reported apart; one users hit gets its own small fix), and attacks instead of re-running the builder's suite. T1 is lean (claims, affected specs, measurements at 360 and 390, one light/dark pair per screen, every built state); T2 is full (also the money attacks, every drawn state of a pay screen, a local stack). T0 has no verifier: the lead reads the diff. The verifier never waits on CI; the lead reads the pushed head's run for the full suite. Template: `references/briefs.md`.

## Reporting

**Report what ran, not what you hoped ran.** An unrun gate (Phase 5 skipped, a
breakpoint not measured, the invariant script not wired) is reported as NOT
RUN with the reason, never left off the summary; omitted, its absence reads as
a pass. "I could not verify this here, and why" is a complete result. A
builder's report is claims plus measurements; the verdict is the verifier's.

## Autonomous mode and owner questions

The owner is asked in six cases only: a money figure the sources do not give; a legal, licence or brand word; a key, account or live number only the owner holds; a destructive change to real money or data; ledger and provider disagreeing; changing a rule the owner made. Everything else: decide, record to `decisions.json` as "Default (lead), owner may override" with a confidence, continue (defaults are listed, never asked); emit
`REVIEW.md` leading with the low-confidence calls and the screenshots. When the reader
is the owner, REVIEW.md is a visual board (a stepper or bar for progress, a card per
call with its screenshot, short labels, the product's own design system, light and dark),
never paragraphs.

| Decision | Default | Confidence |
|---|---|---|
| Design and product invariant conflict | Invariant wins; log the design divergence | high |
| Design shows a feature the product forbids | Do not build it; record it | high |
| Ambiguous copy rewrite for a banned word | Pick the clearest replacement; list all changes in REVIEW.md | medium |
| Shared component needs a variant | Add a prop; never fork | high |
| A control or section whose task is not built | Do not draw it (no do-nothing button, no placeholder row); record it as blocked with the task id. A built section stays drawn with its designed empty state | high |
| Screen exceeds its design's scope | Build the design; list the extra as a default the owner may override | medium |
| Measurement tooling unavailable | Do every static check, and report Phase 5 as NOT RUN | high |

Never auto-decided: deleting a screen or a feature, changing brand colours or
the token layer's meanings, or reporting Phase 5 as passed when it did not run.

## Halt conditions (in autonomous mode, apply the default and record)

- Two agents need the same shared file (serialise, never parallel-write).
- A screen's contract type does not exist (Phase 2 incomplete; fix upstream).
- The invariant script fails on code the pipeline did not write (pre-existing
  violation: record and continue; do not silently fix outside scope).
- Phase 5 cannot run at all. Say so plainly; never imply it passed.
- A measured defect recurs after a fix: the fix was verified by reasoning, not
  measurement. Re-measure before claiming it again.

## References

- `references/measurement.md`: how to drive the browser, what to read, the
  thresholds, the CDP snippets, cleanup, and memory kills.
- `references/invariants.md`: a starter invariant script and the rule
  categories, with the executable check for each.
- `references/briefs.md`: the build brief and the verify brief.
