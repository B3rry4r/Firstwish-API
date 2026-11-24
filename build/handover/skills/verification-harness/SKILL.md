---
name: verification-harness
description: Install an executable verification layer (static gates that exit non-zero, a render harness, and a live end-to-end gate) into any repo, and run it in an agent loop without letting the builder silence it. Use whenever the user wants build rules enforced by code instead of prose, a pre-commit/CI gate for stubs/mock-data/dead-controls/forked-components, a "definition of done" that isn't self-certified, a way to prove a screen/endpoint talks to a REAL backend rather than a mock, or gate results compared against a main branch that already fails. Trigger on phrases like "add gates to this repo", "stop agents from shipping stubs", "verification harness", "prove this isn't mocked", "CI gate for dead code", "baseline the existing violations". Do NOT use this to fix the violations it finds, a gate reports findings and fixing them is a separate pass. A builder never edits a gate or a baseline to get green; a baseline entry is the lead's or owner's act.
---

# Verification harness

**Prose cannot fail. A law that is not an exit code is not a law.**

A build's rules - no stubs, no mock data on a real path, no forked
components, no dead controls - get written down correctly in a CLAUDE.md or a
skill file, and get ignored anyway, because the only thing enforcing them is a
model deep in a long build that wants to finish. On the project this harness
was extracted from, that produced 31 items the pipeline had reported *done*
over, plus a hardcoded chart shipping to production. The fix was not a better
prompt. It was turning every one of those rules into a script that exits
non-zero.

This skill ships that script, working, as `assets/` - not a description of
what one would look like. Following it should leave a repo with a running
`scripts/gates/run.py` inside minutes.

## Install

```bash
mkdir -p scripts/gates/checks
cp assets/gates/run.py assets/gates/check_baseline.py assets/gates/compare.py scripts/gates/
cp assets/gates/checks/*.py scripts/gates/checks/
# Pick the variant closest to the target stack and edit `repo`/`files`:
cp assets/gates/gates.config.example.json      scripts/gates/gates.config.json   # Flutter
cp assets/gates/gates.config.example.node.json scripts/gates/gates.config.json   # React/Next/TS
cp assets/gates/baseline.empty.json scripts/gates/baseline.json

# The design renderer. Required by qa-audit's picture-against-picture pass and
# by any skill that compares a built screen to its design canvas.
mkdir -p scripts/design
cp assets/design/render_design.py scripts/design/

python3 scripts/gates/run.py --accept   # FIRST adoption only, by the lead or owner: adopt EXISTING violations
python3 scripts/gates/run.py            # clean after a first adoption; see "Gates on a repo that already fails"
```

**Set `stack` in the config.** `flutter`, `node`, `php` or `python`. It selects
which pattern families each gate runs. It used to be a decorative key that
nothing read, which meant a Node repo was scanned with Dart-only regexes: every
gate passed because nothing could match. If `stack` is absent it is inferred
from the `files.source` globs, and an unrecognised stack runs every family
rather than none - noisy, never silently empty.

**Check the denominator on that first run.** The summary line ends with
`files scanned: N`. If `N` is far below the repo's real file count, the
`files.source` globs do not fit this repo's layout - the commonest porting
mistake, since `src/**` and `app/**` and `lib/**` are all somebody's convention.
A partial scan reports a clean bill of health for the part it never opened.

`run.py` exits `0` clean, `1` on un-baselined findings, and `2` **inconclusive**,
which is what a zero-file scan returns rather than the green light it used to
print. Nothing was examined, so nothing was cleared. CI must treat `2` as a
failure, not as "not a 1".

Then the lead or owner goes through `scripts/gates/baseline.json` and replaces every
`UNSET -- ...` with a real owner and reason, or deletes the entry and fixes the finding.
`check_baseline.py` fails on any entry that still says `UNSET` - see **The baseline**.

Wire `assets/ci/gates.yml` into `.github/workflows/`. It runs the gates and
`check_baseline.py` on every push to a work branch and PR (Python 3.9+ only), plus a
`tests` job for the full suite: merge needs it green, so the full suite is not first
met after merge (three deploys were once stopped by a suite that ran only post-merge).

### Running it in an agent loop: affected tests per task, the full suite in CI

Per task an agent runs only the **affected** tests (the specs for the files it
changed), typecheck and lint on changed files, and the gates, each in a quiet log:
`(python3 scripts/gates/run.py; echo "EXIT $?") > $S/logs/gates.log 2>&1; tail -n 15 $S/logs/gates.log`
(`$S` is your scratch folder). The full backend suite runs in CI on every push; the
full app suite runs once per batch, by the merge agent. An agent never runs the full
suite per task and never waits on or polls CI: it pushes and hands back with the
head shas, and the lead (or a watcher script) reads the run once. Depth follows the
tier: T0 affected tests and typecheck; T1 adds lint, gates and one light/dark picture
pair per screen; T2 adds the live gate on a local stack and every drawn state of a
pay screen. Gate every push on that log's own `EXIT` line, never on a background
job's exit code; `EXIT 2` is a failure. Read the tail: re-reading old output is most
of what an agent run costs.

`assets/ci/live-gate.yml` is the live end-to-end layer; it needs a driver test
written for the target stack first - see `references/per-stack.md` - and a
real (non-production, seeded) backend to point at.

## The three layers

Each layer can see what the one below it cannot, and none of them can see
what the layer above it sees:

| layer | catches | cannot catch |
|---|---|---|
| **static gates** (`scripts/gates/`) | code smells: stubs left as prose, mock data on a real path, forked components, dead controls, hand-typed wire shapes, hardcoded signals, banned product language, unconfirmed provisional values, open pipeline items | anything that requires actually running the app - a blank screen, wrong copy, a control that's wired but broken at runtime |
| **render harness** (stack-specific, `references/per-stack.md`) | blank screens, layout overflow, build/paint exceptions, wrong copy a human can see in a screenshot | whether the data on screen is REAL - it typically runs against a mock, so a mock answering *plausibly wrong* for a shape it doesn't recognize passes clean |
| **live gate** (`assets/ci/live-gate.yml` + a stack-specific driver) | the seam to the real backend: real login, real network calls, a value that exists *only* on the server | anything the seeded test account/environment doesn't exercise; release-build-only defects if it only runs against a debug/dev build |

**Every instrument must confess its blind spots.** A
render harness that walks routes and reports "75 screens, 0 unrenderable"
while an entire modal-sheet flow - no route, so invisible to a route walk -
sits outside the count has not found zero problems; it has hidden a third of
the product from its own denominator. The same shape recurs as: a broken
`extra:`-based route rendering the app's own error card and being counted as
a success, and a mock adapter returning a plausible generic object for any
shape it doesn't recognize. **Make unreachable states enumerate themselves,
with reasons - a smaller honest number beats a flattering one.**
`references/per-stack.md` names the concrete blind spot for Flutter, React,
and API stacks (modal sheets, flag-gated variants, admin-only routes).

Level of evidence, weakest to strongest - none of them subordinate to the
next; all are required together:

1. It compiles - not done.
2. Unit tests pass against mocks - not done. `test/fixtures/mock_api_adapter.dart`-shaped
   files mean the whole suite can be green while the app cannot reach its
   backend at all.
3. Gates green - necessary, still not done.
4. The screen/endpoint renders with real data from a real backend, reached
   through the real login/auth flow, and a value that exists *only* on the
   server is visible: **done.** Who runs it: agents use the provider's sandbox
   or the repo's stand-ins and never a payment or identity provider, production
   or a real account. The lead alone runs a read-only live check after deploy
   (a GET, a page render, never a payment). Whatever did not run against the
   real thing is reported "NOT RUN against the real provider: why".

## The ten gates

Every gate traces to a real shipped bug. That citation is not decoration -
it's what stops a future agent from deleting a gate it finds inconvenient.
Full detail, incident, and code: the module's own docstring in `checks/`.

| gate | refuses to let through | the bug it exists for |
|---|---|---|
| `deferrals` | a comment that names a gap and defers it (`out of scope`, `TODO`, `for now`, `will be added later`) | three of the worst shipped defects in the project this harness came from were correctly described in a comment **by the agent that created them**, and shipped anyway |
| `fake_data` | production code importing or referencing a mock/demo/seed source | fixture data flowing through the real read path is what makes a disconnected app look connected - the hardest defect for a human to catch by eye, because the screen is full and the numbers are plausible |
| `wire_types` | a response shape (`fromJson`/`toJson`, a hand-declared `interface FooResponse`) declared outside the data layer | a client typed `{items}` against an endpoint that returns a bare array; every test that mocked the client's own type passed |
| `forks` | one class/enum/mixin name declared in two files | a forked `ErrorState` defaulted to "check your connection," so every 403 told the user their network had failed; a forked `ApiError` made an `instanceof` check against the wrong copy fail silently |
| `hardcoded_signals` | a constant standing in for a runtime source (`bool get isOnline => true`); raw colour literals outside the token layer | a beautifully designed offline state no user could ever reach, because the boolean that would enter it was hardcoded true |
| `dead_controls` | an empty or null handler on an interactive control | the user taps, nothing happens, they conclude the app is broken - correctly |
| `product_invariants` | user-visible copy matching a banned pattern, config-driven (`gates.config.json`'s `"banned"` list) | a banned word was swept clean once and reintroduced in five places by code written later the same session - a rule enforced only by memory is re-broken within the hour |
| `pipeline_open_items` | unresolved `stubs.json` / open `ui-align-tasks.json` / non-empty `conflicts.json` (from the pipeline-shaped skills, if in use) | the skills already called these HALT CONDITIONS in prose; 31 items were open and nothing halted, because a halt condition in a markdown file is evaluated by a tired model that wants to finish |
| `provisional` | an unconfirmed value reaching a **release** build (see marker format below) | "confirm before go-live," written as a comment, is exactly the kind of prose this whole harness exists to stop trusting |
| `unbacked_promises` | UI copy promising a future act by us to the user ("we'll notify you", "we'll email you") or a guarantee/SLA, with nothing named to deliver it | a KYC screen said "We'll notify you when you're verified" with no push, no email, no mechanism of any kind; another promised a "24-hour security hold" nothing implemented. A wrong number is an error someone spots - a promise nothing keeps is only discovered when a customer relies on it |

Two of these - `product_invariants` and `provisional` - need no new Python to
extend, only a config/comment change. See `references/writing-a-gate.md`.

`unbacked_promises` reads *meaning* rather than structure, so it is the gate
most at risk of crying wolf. It ships two-tier: a promise of a future act **to
the user** fails on its own; a bare duration or guarantee only warns, and only
when first-person framing makes it a commitment. Its first run on a real repo
flagged *"we will notify the Commission within 72 hours, as Section 40 of the
NDPA requires"* - a statutory duty owed to a regulator, correctly written down -
so Tier A now requires the promise to land on `you`. Expect to tune it once per
repo, and prefer the release valve (`// MECHANISM: <what implements it>`) over
widening the pattern.

## The baseline

`baseline.json` holds findings that have been explicitly accepted. A
baselined finding prints as `ACCEPTED` and does not fail the build - but the
finding still exists and is still visible in every run's output, unlike a
suppression comment nobody re-reads.

This is what "deferred by the user" means in an executable sense: **a line in
a file, with an owner and a reason, that a machine reads and checks** - never
a sentence in a report nobody reopens. `check_baseline.py` runs in CI
alongside the gates and fails if any entry's `owner` or `reason` is a
placeholder (`UNSET`, `TODO`, `TBD`, `N/A`, `?`, `-`, or under 15 characters
for the reason) or missing.

Adopting an existing repo: the lead or owner runs `--accept` once to snapshot
every current finding, then works through the entries: delete-and-fix, or fill
in a real owner and reason. **The ratchet only turns one way**: `--accept`
baselines what exists *right now*; any new finding on the next run is new, full
stop. Nothing auto-baselines. A builder fixes the code. It never adds, edits or
deletes a baseline entry or a gate to get green. An entry is the lead's or
owner's act, in its own commit, with a named owner and reason; the verifier
reads that commit first.

### Gates on a repo that already fails

A live repo's main often fails already (one had 16 FAIL lines). The check is then
"the same FAIL lines as main", not zero, and `--accept` is not the answer (it
would launder every old finding). Run `python3 scripts/gates/compare.py --base
origin/main`: it runs `run.py --json` in a detached worktree of the base and in
your tree, and fails on any FAIL key the base lacks (keys carry no line number,
so moved code is not new). A side that scanned zero files is INCONCLUSIVE: compare.py
exits 2 ("could not compare") rather than saying "same 0 FAIL", and `run.py --json`
reports `files_scanned` and exits 2 the same way. Hand back "same N FAIL as main" or
the new lines.

## Keeping gates quiet

A gate that cries wolf gets switched off, and a switched-off gate is worse
than no gate - it still reads as coverage to the next person who checks the
README table. `checks/deferrals.py` is the reference pattern for staying
quiet without going blind, because it has the highest false-positive surface
of any gate here (ordinary engineering comments use words like "mock,"
"stub," and "replace" constantly):

- **Tier A** - phrases that are an admission on their own: `out of scope`,
  `TODO`/`FIXME`/`HACK`, `not yet implemented`. Fires unconditionally.
- **Tier B** - phrases that are only an admission *next to a temporal
  marker*: `mock`/`stub`/`placeholder`/`wire`/`replace` alone describe
  ordinary code ("kept as a local stub because models.dart was out of scope
  for this pass" is provenance for a decision already made). Tier B only
  fires when a word like `later`, `until`, `pending`, `next wave`, or `for
  now` also appears in the same comment.

Describing what a system **does** is not a deferral; promising what it will do
**later** is, and that distinction keeps the gate switched on. Give any new
ambiguous-phrase gate the same second-signal treatment before it runs at `fail`.

## The `PROVISIONAL` marker

Some values get committed before anyone can confirm them - a fee rate
back-derived from a mockup, a threshold nobody has checked against a
published schedule. That's legitimate; it unblocks work. What's not
legitimate is that value quietly becoming production because "confirm before
go-live" was only ever a comment.

```
// PROVISIONAL(FEE-RATE-01, owner=compliance, why=not checked against NGX schedule)
```

- Missing `owner` or `why` → **always FAIL**, at any time. A provisional value
  nobody owns is a value nobody will confirm.
- A well-formed marker → **WARN** on every normal run (day-to-day work is
  never blocked by it), **FAIL** when `GATES_RELEASE=1` is set in the
  environment. Wire that variable into whatever workflow actually cuts a
  release, so a release build structurally cannot carry an unconfirmed value
  forward - not "the team remembered to check."

## Two gates that were themselves wrong

A gate is code, and code has bugs in both directions: a false positive teaches
people to ignore it, a false negative lets the defect back in. Both happened here
(full detail in `references/writing-a-gate.md`):

1. **`hardcoded_signals.py`'s colour check flagged `Color(0x00000000)`** - fully
   transparent - as an untokenised brand colour. Transparent carries no hue;
   a token layer can't express "40% black scrim" any better than the literal
   does, and flagging it just taught people to stop reading the gate's
   output. The fix computes RGB spread and average brightness and only
   exempts literals with no real chroma - a real hue (a chart purple) still
   fires.
2. **`check_baseline.py`'s placeholder list originally included `""`.**
   `"anything".startswith("")` is `True` in Python, so every genuinely good
   owner name and reason matched the "looks like a placeholder" check, and
   every valid baseline entry failed CI. Emptiness is now handled by a
   separate length check; the placeholder list never contains the empty
   string.

## References

- `references/writing-a-gate.md` - the `Context`/`Finding` API, the two-tier
  quiet-gate pattern in full, and the two worked "gate was wrong" examples
  above with their actual fixes.
- `references/per-stack.md` - render harness and live gate specifics for
  Flutter, React/Next, Expo / React Native, and a plain HTTP API (including
  changing an API with paying users): what "render" means per stack,
  how to drive a live gate without a minted token, what "a value that exists
  only on the server" looks like, and the stack-specific gotchas that cost
  real time (Flutter: `-d web-server` not `-d chrome`, `--browser-dimension`,
  why `pumpAndSettle` never returns against a repeating animation or
  periodic timer).
