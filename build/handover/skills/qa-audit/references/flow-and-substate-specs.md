# Driving interaction-gated states: the pattern in full

A route-walk mounts a screen's default state and stops. Everything that lives
behind a tap - a second tab, an expanded card, a modal sheet, an error branch,
a multi-step flow with text entry gating its own "Continue" button - needs to
be *driven* there. This project's `test/shots_substates.dart` and
`test/shots_flows.dart` are working reference implementations of the two
shapes this takes. Read them before writing an equivalent for another stack;
what follows is the pattern, generalized.

## Two shapes, not one

**Sub-state**: a variant of an *already-routed* screen - a second tab, an
empty/loading/error body, a fixture scenario that changes what renders at the
same route. This is "fixture + a flat list of texts to tap", e.g.:

```dart
SubStateSpec(
  screen: 'asset_detail',
  substate: 'order_book',
  route: Routes.assetDetail('MTNN'),
  dartFile: 'markets/asset_detail_screen.dart',
  tapTexts: ['Order book'],
)
```

**Flow**: a sequence that is never a route at all - launched from a button on
a routed screen, multi-step (each step pops one sheet and pushes the next),
and often gated by **text entry** before its own primary button unlocks (a
shares field that starts empty; "Review order" stays disabled until something
is typed). Bolting text entry and multi-sheet navigation onto the sub-state
shape makes it do two unrelated jobs - give it its own spec instead:

```dart
FlowSpec(
  name: 'buy_review_s29',       // named after the artboard, not a made-up label
  route: Routes.assetDetail('MTNN'),
  dartFile: 'trade/trade_flows.dart',
  steps: const [
    Tap('Buy'), Tap('Name your price'), Tap('Continue'),
    EnterText('60'), Tap('Review order'),
  ],
)
```

Each step runs against the **same mounted app** the previous step left on
screen - a real tap or a real text entry on whatever sheet is currently up,
with a settle pump after each one. The terminal step of a flow is often a
*new* page push that starts only once an async chain (verify → place order)
resolves after the last input - give it extra settle time; a half-transitioned
capture is a false negative, not a passing render.

## Naming captures

Every capture is named after **the design element or artboard id it should
match** - `buy_review_s29`, `sell_pin_s30` - never a description invented on
the spot (`buy_flow_step_4`). The name is the join key a *different*, later
audit uses to pair render to design without re-deriving anything. If the
canvas has no id for a step this codebase's own composition introduces (a card
panel the artboard draws no content for, say), name it plainly and note in the
spec that it's the app's own composition, reviewed once rather than matched to
a design source that doesn't cover it.

## The false-capture guard

A screen's own generic error/loading view rendering instead of the target step
is not a capture of that step - it's a broken drive (a mistyped tap target, a
step fired before its precondition, a fixture that doesn't support the
scenario). Check for it explicitly after every drive:

```dart
if (find.byType(KErrorView).evaluate().isNotEmpty) {
  errorViewError = "rendered the app's own KErrorView instead of the target "
      "flow step - likely a step text/order mismatch, not a genuine capture";
}
```

A second kind of false capture is a build that points at another agent's ports:
a shared bundler cache bakes their API ports into your bundle, so a clean-looking
picture comes from the wrong backend. Export with your own cache dir
(`TMPDIR=<scratch>/tmp`, or `--clear`) and grep the bundle for `localhost:` before
the first picture; only your own ports may appear.

Mark that capture failed, with the reason, and do not let the PNG stand in as
evidence. The one deliberate exception: a spec whose entire *purpose* is to
drive the screen into its real error state (a `network: error` fixture) - for
those, finding the error view is the capture working, and the guard should say
so rather than flag it.

## Recording what cannot be reached: with the mechanism, not "skipped"

Some states depend on something the harness cannot control. Example from this
project: which of two withdrawal sheets renders is chosen by
`_isOutsideWithdrawHours()`, which reads the real `DateTime.now().weekday`
first - with no injectable clock anywhere in the app, and adding one would be
an app-code change outside this pass's scope. Which branch is reachable
depends on which real day the suite happens to run.

The correct record is not "skipped" - it names the exact mechanism:

```dart
const _unreachable = [
  (
    name: 'withdraw_inhours_s37',
    dartFile: 'wallet/wallet_flows.dart',
    reason: "_isOutsideWithdrawHours() checks DateTime.now().weekday first - "
        "this suite ran on a Saturday, so the in-hours branch (and the "
        "success sheet only it leads to) cannot be reached without injecting "
        "a fake clock, which needs a lib/ change (out of scope for this pass).",
  ),
];
```

This row goes into the **same table** as everything that was captured - same
report, same visual weight, not a separate document that reads as an
afterthought. A count of unreachable states with real mechanisms attached is
more trustworthy than a report that simply never mentions them.

## Seeding real credentials into flows that need them

A flow that ends at a real PIN/passcode confirmation step needs the mocked
secure-storage backing to hold a value the real verification code can
actually check against - not `null` for every read, which makes every PIN
entry fail forever and strands every buy/sell/withdraw flow before its
terminal screen. Seed a known passcode using the **same hashing scheme the
real store uses** (duplicated in the test fixture, since the production
hashing is usually a private implementation detail, not exported for a test to
call), and use that value in every `EnterText`/digit-tap step that needs it.
This is a one-time setup cost per project, not a workaround - skipping it
means the entire terminal-state population of every credential-gated flow is
silently absent from the report.
