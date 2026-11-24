---
name: qa-audit
description: Independent QA of a built application, in two modes. Full audit - enumerate coverage from a source outside the code, walk flow scenarios (every actor x entry-state x branch), drive states behind interaction (modals, tabs, error paths), and produce rendered evidence a human can review. Task check - a verifier for ONE builder task or bundle (lean at T1, full with the money attacks at T2, none at T0) that tests the builder's claims against the brief and the base branch and ends in a severity-ranked merge or fix verdict. Use for an audit, a QA pass, a conformance check against a design, a pre-ship review, or a verifier for a task or branch. Triggers on "audit the app", "QA pass", "find defects", "independent review", "verify this task", "check the builder's claims", "walk the flows", "check against the design canvas", "is this actually done". Do NOT use this to build or fix anything, it produces findings only. Do NOT invoke the agent that built a screen to audit that same screen.
---

# QA Audit

Independent verification of a built application: what a human can actually do in it,
compared with what the design says and what the product claims. Findings only.

It exists because every screen of one redesign was certified by the agent that had just
written it, with render tests it also wrote ("75 screens, 0 unrenderable"). The owner then
found ten defects in an hour, including a third of the product that no screenshot had ever
covered. Each law below is a scar from that pass; the stories are in `references/scars.md`.

## Pick the mode

- **Task check (Mode B)**: the brief names one task or bundle, a branch or a builder's claims. This is
  the default for a verifier, sized by the task's tier. Go to "Mode B".
- **Full audit (Mode A)**: an app, a release, "is this actually done". Phases 0 to 7 below. Never run per task.

Both obey the laws. Every T1 or T2 bundle gets its own verifier; T0 work has none (see Mode B).

## Core laws

1. **No agent audits its own work.** Independence is structural: before starting, confirm
   this pass built no screen in scope (git log/blame, or the build pass's manifest). The
   brief states who built it and who verifies, and they are different agents. If this
   session built any of it, refuse and hand the audit to a fresh session.
2. **Assert capability, never the absence of errors.** "A user can place a buy order and is
   asked for their PIN", never "the screen renders" or "no error view is present".
3. **Coverage comes from outside the code.** Never ask the router what screens exist. Pull
   them from the design canvas (parsed), the route table and the product's own feature or
   ruling list; reconcile. A mismatch between the three is itself the finding.
4. **A pairing is not a verification.** Coverage and conformance are separate columns. A row
   paired but never compared is `unverified`, never `matched`. The headline number is
   screens **compared**, not paired.
5. **Compare pictures with pictures.** Render the design and set it beside the app capture.
   A screenshot against HTML source is not a comparison. If the design cannot be rendered,
   every screen in that area is `unverified`.
6. **A citation is not evidence.** A comment naming the artboard it was built from says
   where someone once looked, not that it matches.
7. **Enumerate what you could not reach, with the mechanical reason, in the same table** as
   what you could. "Skipped" is not a reason; "no injectable clock, the branch depends on
   the weekday" is.
8. **Flow scenarios, not screen checks.** Enumerate actor x entry-state x branch and walk
   each path start to finish. Never infer a flow from the route table.
9. **States behind interaction need driving, not routing.** Modal sheets, second tabs,
   expanded panels and error branches need an explicit tap/type sequence. Name the capture
   after the design element it should match.
10. **A capture of the wrong thing is not evidence.** Not the app's own generic error or
    loading view, and not a build pointing at another agent's ports or cache. Log it as a
    broken drive; never keep the PNG.
11. **Every finding carries two labels.** `kind`: `defect` (the app is wrong, a user notices),
    `divergence-with-reason` (differs from the design but a ruling explains it; cite the
    id) or `unclear` (needs the owner). `severity`: `blocker` (money or data lost, a core
    path broken, a security hole), `high` (a wrong result on a common path), `medium`
    (wrong, with a workaround or on a rare path), `low` (polish). Check every apparent
    mismatch against the project's decisions file before calling it a defect.
    **Blocker, high and medium get a fix round; low goes to the area's sweep list, never a
    new round.** Verdict `merge` when nothing is medium or worse AND the pushed head's CI is
    green AND the gate FAIL lines equal main's; else `fix`. The lead reads the CI run once; the
    verifier never waits on it or reruns it. At most 2 rounds, then the lead rules (accept with
    a sweep row) or re-cuts. A fix of 30 lines or fewer closing named findings may be accepted on
    the lead's diff read, with no re-check.
12. **Only the real thing proves a seam, and an agent may not touch the real thing for
    payments or identity.** Where a value can only exist on a live server, assert exactly
    that value. For a payment or identity seam, verify against the repo's stand-ins or the
    provider's sandbox, name which, and report "NOT RUN against the real provider: why".
    The lead alone does the one read-only live check after deploy.
13. **Release-on-device is its own environment.** What passes in debug or on web does not
    automatically hold in a signed release artifact.
14. **A number or a promise with no writer is a finding.** Before accepting an on-screen
    figure or guarantee, name what writes it. The reverse is also a finding: **show only
    what is built.** A control or section drawn for a task that is not built (a do-nothing
    button, a placeholder row, "coming soon") is a defect. Its absence is correct; record
    it as `blocked` with the task id.

## Mode B: check one task or bundle

The brief names the task or bundle and its tier on the first line. The tier sets how much
checking it gets:

| tier | verifier |
|---|---|
| T0 lean (copy, records, config, test-only, generated files) | none: the lead reads the diff and the test line; no rounds |
| T1 plain (screens and endpoints with no money or identity, removals, sweeps) | lean, about 35 steps (+10 per extra task): the claims list, affected tests, pictures beside the board (one 390 px light/dark pair, screens only), every drawn state, nothing drawn that is not built |
| T2 money and identity (money paths, auth, KYC, deletes, migrations on money tables, third parties) | full, about 90 steps (+20): the Phase 2 money attacks (twice, double tap, wrong PIN, short balance, webhook replay and forge, reversal, ledger equals provider), one wrong-format input, every drawn state of a pay screen, on a local stack |

Work in this order and keep it lean (a check costs about $1 to $5).

1. **Claims.** List the builder's hand-back claims one per line (a bundle is one list). Each
   is a claim to test, not a fact; test, do not trust.
2. **Base.** Run the same check on the base branch (a detached worktree). Same on base =
   pre-existing; report it apart. A pre-existing defect that users hit still gets its own
   small task.
3. **The exact cases in the brief**, as a user does them. Run only the specs for the touched
   files; the full suite is CI's. Do not rerun what CI ran or wait for it.
4. **Pictures for screens.** A payment page merged without a check ran 13 px past every phone
   for 2 days. Check the narrowest phone width first; a page that takes money or input and
   is wider than the viewport is a blocker.
5. **Cost rules.** Stay inside the tier's budget; a re-check of named finding ids is about 15
   steps. `$S` is your scratch folder (your own, named in the brief;
   make `$S/logs` and `$S/pids` there). Write full output of every run to a log and print only
   the tail (`(cmd; echo "EXIT $?") > $S/logs/x.log 2>&1; tail -n 15 $S/logs/x.log`, then
   `grep -n -m 20 -E "FAIL|Error" ...`); never cat a whole log or diff. Never sit idle: look
   again within 4 minutes (the cache lapses at 5), in a loop with a timeout. Stop every server you started, by PID
   (never `pkill`), and check `ss -ltnp` on your ports before hand-back. Agents you start
   run on the cheaper model tier the owner set (Sonnet here); never resume an Opus agent.
6. **Output: one verdict file, 40 lines or fewer, no Artifact**: the verdict; findings by
   severity (kind, owning file, evidence); the claims tested (confirmed or refuted); what
   was NOT run and why. Hand back in 20 lines or fewer: severities, not the full report.

**Machine budget** (both modes; before you start agents, servers or builds on a shared machine):

- Measure first (`nproc`, `free -g`, `df -h` on the work and temp folders); put the figures in every brief.
- Heavy agents (servers, suites, builds, exports): at most min(CPUs + 1, available GB / 2.5),
  rounded down, measured at the start (WMT: 4 CPUs and 15 GB; 9 caused out-of-memory kills).
  Text-only agents do not count.
- Start a heavy job only at 5 GB available, else look again within 4 minutes. "Memory cgroup
  out of memory", a jest SIGKILL or a silent server death is memory, not code: wait, rerun.
- Check free disk before builds and exports; delete large outputs and stale worktrees when
  done. Full suites run in CI, not on the shared machine.
- Housekeeping is the dispatcher's job: after every batch, every few hours, and at once under
  about 20% or 5 GB free disk or 5 GB available memory. `df -h`, `free -g`, a process list;
  `git worktree remove` then `prune`, plus scratch folders, for merged or abandoned tasks; delete
  large leftovers; stop orphan servers by PID once no running agent owns them. Never delete a
  folder a running agent uses or evidence an open task cites; launch no new heavy agent under the
  line. (WMT: 108 folders cleared, 3.9 GB to 9.5 GB free, 12 agents running.)

## Pipeline artifacts, Mode A (`.qa-audit/` at the repo root)

```
.qa-audit/
├── independence.md         # Phase 0: who audits, nothing in scope self-built
├── coverage-inventory.json # Phase 1: screens x artboards x rulings; coverage + conformance columns, conformance starts `unverified`
├── scenario-matrix.json    # Phase 2: actor x entry-state x branch x flow-step
├── flow-specs/<flow>.json  # Phase 3: declarative step specs, named per design element
├── captures/               # Phase 3: rendered evidence of the APP
├── design_shots/           # Phase 4: rendered evidence of the DESIGN
├── unreachable.json        # Phase 3: every state not captured, with the mechanical reason
├── findings.json           # Phase 4: kind + severity, ranked
├── release-check.md        # Phase 5/6: capability/permission diff, device result or why not run
└── REPORT (an Artifact, or REPORT.md)  # Phase 7
```

## Phase 0: independence (once, before any finding)

Confirm this pass built nothing it will audit (`git log`/`git blame`, or the build pass's
manifest). If this session, or the one that spawned it with shared context, authored any
in-scope screen, **halt and say so**. The first line of the report is the independence
statement; a report without one is indistinguishable from self-certification.

Driving and capturing (Phase 3) need a render harness; the live assertions (Phase 5) need a
live gate. The `verification-harness` skill installs both; install it if the repo has
neither rather than hand-rolling capture scripts. Two checks before trusting it: its summary
prints `files scanned: N` (far below the repo's real count means the globs miss part of the
tree, and a zero-file run exits `2 INCONCLUSIVE`, not `0`); and static gates are a floor, not
coverage, since a repo at zero findings can still have a blank screen and a dead control.

## Phase 1: coverage enumeration

Pull the screen list from **three sources that do not read each other**: (1) the route
table, grepped from the router config, never a hand-kept list; (2) the design canvas,
parsed programmatically from its own source into id/title/copy/structure-hash per artboard
(`references/coverage-enumeration.md`); (3) the product's own feature or ruling list.

Reconcile into one table, one row per screen, with **two independent status columns**:

| column | values | means |
|---|---|---|
| `coverage` | `paired` · `ruled-no-artboard` · `needs-ruling` · `unrouted-undiscovered` | does something exist for this artboard |
| `conformance` | `unverified` (default) · `conforms` · `diverges` · `unbuilt` · `blocked` | has its render been compared to the design |

Every row starts `unverified`; only a completed comparison moves it, and `conforms` names the
capture compared. There is deliberately no status meaning "paired, therefore fine".
`unbuilt` (designed, ruled, its task done, and absent) outranks every cosmetic finding.
`blocked` (its task is not built, so it is correctly not drawn) names the task and is not a
defect. Modal sheets, tabs and anything not in the route table are enumerated separately as
`UNROUTED` rows: a screen absent from the route table is not absent from the product. A
mismatch between the sources goes at the top of the report, ranked by what it hides.

## Phase 2: flow scenarios (actor x entry-state x branch)

**Actors**: read the app's real session/gating state and enumerate every reachable
combination (guest, signed-up, KYC in each terminal non-approved state as separate actors,
fully eligible, suspended/frozen). **Entry states**: cold start, resumed from background,
mid-session; cold start and resume are different. **Branches**: happy, empty, error,
offline, permission-denied, per flow step.

**Role x control matrix.** For each role, list the controls it sees. Create or edit controls
shown to a read-only role are dead controls (a defect).

**Composition checklist**, for every flow before it is marked covered (invisible to unit
tests because each unit is individually correct):
- A control that depends on a local credential (passcode, biometric) some reachable actor
  has not set: walk the path that actor takes.
- A resume-lock that must also fire on **cold start**, not only on `paused -> resumed`.
- A client that trusts an HTTP status but not the boolean buried in a 200 payload: walk the
  path where that flag is false.

**Live-system probes**, for any flow that moves money, counts a limited resource, deletes
an account or takes a provider webhook: two identical requests at the same instant (real
parallel requests; two deletes once freed extra places); a retry with the same
Idempotency-Key; a read failing between charge and record (a double charge); a webhook
amount versus the row's own amount; erase, where every flag that must clear does (a phone
stayed verified); a resource released before proof; hold expiry; old-style rows after a
widened constraint.

Output one row per (actor, entry-state, branch, flow-step) into `scenario-matrix.json`. Each
gets a capture or an unreachable reason in Phase 3; no row disappears.

## Phase 3: drive and capture

Write a declarative step spec per interaction-gated flow (tap this text, enter this value;
`references/flow-and-substate-specs.md`) rather than hand-scripting captures. Rules:

- **Name every capture after the design element or artboard id** (`buy_review_s29`, not
  `buy_flow_step_4`), so a different later audit can pair render to design.
- **False-capture guard.** A capture is false if the app's own error/loading view rendered
  instead of the target step, or if the build points at another agent's ports. Export with
  your own bundler cache dir (a shared cache bakes another agent's API ports into the
  bundle) and grep the bundle for `localhost:` before the first picture; only your own
  ports may appear. Log a false capture as broken; never keep the PNG.
- **An unreachable state is recorded with its mechanism**: a real-clock-gated branch with no
  injectable clock, a flag off in this build. "Skipped" is not acceptable in a report.
- **Every capture in each theme the product ships** (light and dark if it has both).

## Phase 4: compare, picture against picture

This pass is not optional; its absence caused the worst miss in this skill's history.

**Render the design.** If the source is HTML (a `.dc.html` canvas, an HTML export), it renders
in headless Chrome. `verification-harness` ships `scripts/design/render_design.py`
(`--list`, no args for every artboard, `--label X`; output `build/design_shots/<id>.png`).
It exits non-zero when a render cannot be trusted (React not mounted, webfonts missing, zero
artboards matched); those screens stay `unverified`. If the design is a PDF, a flattened
image or a link with no export, say so and mark that area `unverified`; do not fall back to
reading source.

**Then compare.** Cost: make one composite PNG per screen (design on the left, app on the
right, a light row and a dark row), open it once, write the verdict row immediately and do not
reopen it; every image stays in context for all later steps. Spacing, grouping, iconography,
row treatment and copy then announce themselves.

**A half-render is worse than none.** Relative paths 404 if the HTML is rendered from
elsewhere (text on a blank ground); and the design system is a runtime that walks the DOM at
load, so cutting one artboard out drops the bootstrap (icons vanish, text stays). Render the
original file, unmodified, in place, and isolate the artboard with an injected style using
`visibility`, not `display` (which collapses the computed layout), with a virtual-time budget
so components register. Sanity-check the render: no icons, no web fonts or a blank ground
means fix the render, never compare against it and never write it up as a "known limitation".

## Phase 5: classify and rank

One finding per capture (reached or not) and flow walked:

| field | rule |
|---|---|
| `kind` / `severity` | per law 11; blocker, high, medium get a round, low goes to the sweep list |
| `owning file` | the exact file whose change would fix it |
| `citation` | for `divergence-with-reason`, the ruling id, checked in the rulings file, not from memory |
| `evidence` | capture path(s), or the flow-walk description |

Before marking `defect`, check the project's decisions document; a confident code comment
defending a divergence is a claim to verify, not a reason to accept. Rank worst-first by
what the defect hides or costs: an uncovered revenue path outranks a swapped button order;
a promise the backend cannot keep outranks a cosmetic label.

## Phase 6: release-artifact check

Never assume a release build inherits what debug proved. Diff whatever declares runtime
capabilities across build variants (Android manifests per flavor, iOS entitlements, web
CSP) and flag any capability present in debug and absent from release. If a signed release
artifact can be built and installed, repeat one real-login smoke path against it. If not,
report "release-artifact check: NOT RUN: [reason]". Never let a debug pass stand in, and
never omit the row.

## Phase 7: report and deliverable

The deliverable is for a human to look at pictures. Load the `artifact-design` skill if you
have it, then publish an Artifact (`references/human-deliverable.md`). When the reader is the
owner, make it visual (a bar for "17 of 56 compared", a board of unverified screens, short
labels, the product's own design system, no paragraphs). Contents, in order:

1. The one-line independence statement.
2. The headline as compared-out-of-total ("17 of 56 screens compared to their design"),
   never a coverage count or a bare percentage; if the numbers are far apart that gap is the
   headline.
3. The `unverified` list by name, beside the findings, never summarised to a count.
4. Renders grouped by flow, each beside its design element and the capability asserted.
5. Findings worst-first with severity, owning file and (for divergences) the citation. A
   `conformance: unbuilt` row outranks every cosmetic defect.
6. A "not covered" section from `unreachable.json`, with its reasons, given equal weight.
7. The release-artifact result, including "NOT RUN: [reason]", and for any seam "NOT RUN
   against the real provider: why".

"I could not verify this here, and why" is a complete result for any row.

## Halt conditions

- The launching context authored any in-scope screen (law 1): halt before Phase 1.
- No independent coverage source exists at all: say plainly that coverage cannot be
  independently established, still run Phases 2 to 6 with that caveat at the top.
- A finding's severity cannot be settled from the render or the code: classify `unclear` and
  name exactly what only the owner can answer. Never guess to make the report read cleaner.

## References

- `references/scars.md`: the observed failure behind each law, and the numbers from a
  payments build that shaped Mode B.
- `references/coverage-enumeration.md`: parse artboards, diff against routes and the feature
  list, with the worked example.
- `references/flow-and-substate-specs.md`: the declarative step-spec pattern, the
  false-capture and unreachable-state guards.
- `references/human-deliverable.md`: the deliverable's contents and layout.
