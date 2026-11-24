# Coverage enumeration: the technique in full

The point of this phase is that "how many screens are there" must never be
answered by reading the app's own router. A router only knows about routes; it
has no opinion on whether it's missing something. Answer the question three
independent ways and force them to agree.

## Source 1: the route table

Grep the router config directly. Do not trust a hand-maintained inventory
document that lists routes in prose - it drifts the moment someone adds a
screen and forgets to update it. Extract: route path/name, the file that owns
it, and (if the framework supports it) whether it's reachable unconditionally
or behind a guard (auth, feature flag, onboarding gate).

Then grep separately for the app's **modal/sheet/tab launch pattern** - the
call sites that present a screen *without* going through the router at all.
In this codebase that's `showKSheet(...)` calls and in-screen tab switches;
the equivalent in another stack might be a `Modal`/`Sheet`/`Dialog` component,
a wizard step machine, or a client-side-only view-state toggle. These are real
screens with no route, and they get their own inventory row with `UNROUTED`
in place of a path - never omitted because "the router doesn't know about it."

This is not a hypothetical gap. In this project, `test/shots_all.dart` walks
every `GoRoute` and reported "75 screens, 0 unrenderable" while the entire
buy/sell and add-money/withdraw journeys - 34 artboards, the app's only
revenue-generating action - were invisible to it, because
`showBuyFlow`/`showSellFlow`/`showAddMoneyFlow`/`showWithdrawFlow` are plain
function calls, not routes.

## Source 2: the design canvas, parsed from its own source

Never eyeball a design file and guess a screen count. If the canvas is a set
of structured source files (HTML artboards, a Figma export, an SVG set, a
Storybook), write a small parser that extracts, per artboard: an id, a title,
its rendered copy (for later diffing against real screen text), and a
structure/content hash (so a later re-run can tell "unchanged" from "silently
edited" without a human re-reading every artboard).

This project's `docs/redesign/canvas-inventory.json` is the worked example -
generated once, committed, and read by every later phase instead of anyone
re-deriving it:

```json
{
  "source": "canvas",
  "files": ["01 Getting In.dc.html", "02 Verification.dc.html", "..."],
  "counts": { "total": 135, "light": 56, "dark": 55 },
  "screens": [
    {
      "file": "01 Getting In.dc.html",
      "id": "s01",
      "variant": "light",
      "title": "splash",
      "copy": "Light 9:41 LTE <Brand> Invest <Brand> Ltd · <regulator> registered ...",
      "structure_hash": "17088928ee1800c2",
      "full_hash": "2b05ac656c1e4e70"
    }
  ]
}
```

The `id` (`s01`, `s01d` for the dark variant, `s29c` for a state variant of
`s29`) is what every other artifact in this phase joins against. Build the
equivalent for whatever design tool the project actually uses - the shape
(stable id, title, extractable copy, a hash to detect silent edits) matters
more than the source format.

## Source 3: the product's own feature/ruling list

If the project has already gone through a "what does the design say about
screen X" reconciliation, that document is itself a coverage source, and it
should already carry a total that the other two sources must reconcile
against. This project's `docs/redesign/RULINGS.md` is that document: every
in-code screen bucketed as `needs-ruling` (39), `restyle-only` (14),
`redesign-to-artboard` (28), or `no-action` (10), summing to a stated total
(91) that Sources 1 and 2 can be checked against directly.

If no such document exists yet, this phase's own reconciliation table
*becomes* that document - write it, because the next audit will need it and
because a coverage table with no prior version has nothing to reconcile
against but itself, which is a weaker but still real result (say so).

## Reconciling

One row per real screen (routed or `UNROUTED`), with columns: route/launch
site, paired artboard id(s) from Source 2, bucket/ruling from Source 3, and
**two** statuses that must never be collapsed into one - `coverage` and
`conformance` (SKILL.md law 4).

`coverage` is computed from the three sources:

- `paired` - a route, an artboard, and (if a ruling exists) agreement between
  them. **This is not a verdict on the screen.** It means something exists to
  compare; it says nothing about whether the built screen resembles the design.
  The status was called `matched` until an inventory reported 47 of 56
  artboards `matched`, 17 had actually been compared, and an entire unbuilt tab
  hid in the difference. The word was doing work it had not earned, so it is
  gone.
- `ruled-no-artboard` - the product's own ruling says this screen has no
  design coverage on purpose (e.g. `restyle-only`/`no-action`). Not a gap.
- `needs-ruling` - no artboard, and nothing on record saying that's
  intentional. A real, open gap - report it, do not resolve it by guessing
  which side is right (see `DECISIONS.md`'s own rule in this project: the
  design is authoritative for the UI; a missing field is a backend ticket, not
  license to reshape the screen).
- `covered-but-unrendered` - everything matches on paper, but no capture
  exists anywhere in the render harness's output. This status is exactly what
  the 2026-08 conformance audit found for 6 files (~34 artboards) and called
  "itself the largest finding in the report" - treat a nonzero count in this
  bucket as the headline finding, not a footnote.

`conformance` cannot be computed from any of the three sources. It starts at
`unverified` for **every** row and is only moved by a completed comparison of a
render against its artboard - `conforms`, `diverges`, `unbuilt` (designed, its
task done, absent) or `blocked` (its task is not built, so it is correctly not
drawn: name the task, it is not a defect). Nothing else may move it: not a matching filename, not a code comment citing the
artboard id, not the screen having shipped months ago. If your reconciliation
script sets a conformance value, the script is wrong; only the Phase 3/4
comparison can.

Every mismatch across the three sources is reported, ranked by what it hides.
"75 screens, 0 unrenderable" is not a coverage report if it cannot answer "out
of how many, and by what count did you arrive at that denominator."
