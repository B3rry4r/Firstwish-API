# Render harness and live gate, per stack

The static gates (`assets/gates/`) are language-agnostic Python and need no
adaptation beyond `gates.config.json`. The render harness and the live gate
are not - "render a screen" and "drive it" mean different things per stack.
This is guidance, not shippable code: write the actual driver test for your
stack, using the shape below.

**Who runs the live gate.** Agents use the provider's sandbox or the repo's
stand-ins and never a payment or identity provider, production or a real account.
The lead alone runs a read-only live check after deploy (a GET, a page render,
never a payment). Whatever did not run against the real thing is reported "NOT
RUN against the real provider: why".

Both layers share one obligation regardless of stack: **the
harness must enumerate what it cannot reach, with reasons.** A route table,
component list, or endpoint inventory is never the true surface count on its
own - modal sheets, dialogs, websocket-only views, and background jobs are
real surfaces with no route/URL/endpoint of their own, and a harness that
walks routes will silently omit them and then report a number that reads as
complete. Keep a hand-maintained list in the target repo (e.g. `docs/unreachable.md`,
`known-blindspots.json`, whatever) of what the harness structurally cannot
see, and print it alongside every result. A smaller honest number beats a
flattering one.

---

## Flutter

**Render harness** - a `flutter test` file that pumps the real app (real
`GoRouter`, real theme, real widget tree - never a bare `pumpWidget(MyScreen())`
that skips the router and its guards) against a mock backend, walking every
route and asserting no build/layout/paint exception. See
`test/route_walk_test.dart` and `test/shots*.dart` in a Flutter repo for
the pattern: seed `AppState` with every gate flag the router checks
(`signedIn`, `kycApproved`, `suitabilityComplete`, ...) before building, or
routes that guard on those flags never render at all and you get a false
"0 unrenderable."

**Blind spot to name explicitly**: `showModalBottomSheet` / `showDialog` /
`showCupertinoModalPopup` calls are not `GoRoute`s. A route-walk test that
iterates `router.configuration.routes` will never enumerate them, and if the
sheet holds a large flow (buy/sell, funding - an entire journey in some
apps) that is a large fraction of the product silently outside the count.
Grep for the show-a-sheet call sites separately and drive each one from the
screen that opens it.

**Live gate** - `flutter drive` + `integration_test`, against a real running
backend, through the real login UI. Specifics that cost real time to learn:

- **`-d web-server --browser-name=chrome --headless`, never `-d chrome`.**
  `-d chrome` uses Flutter's `ChromeDevice`, which launches its own **headed**
  browser to open a debug connection. On a runner/container with no display,
  nothing ever connects back and the job hangs to the timeout. `-d web-server`
  serves the app over plain HTTP with no browser of its own; a separately
  driven chromedriver instance both hosts and drives it, and *that* one
  respects `--headless`.
- **`--browser-dimension` defaults to `1600x1024`** - a desktop shape. Set it
  to your target device's shape (`430x932` for a typical phone) or every
  screenshot the gate takes is a stretched desktop rendering of a phone
  layout, and layout bugs specific to the real device dimensions go
  unobserved.
- **`pumpAndSettle` never returns if the app has a repeating animation or
  periodic timer.** It waits for zero pending frames *and* zero pending
  timers. A spinner using `AnimationController(...)..repeat()`, a polling
  `Timer.periodic`, a rotating-content carousel - all correct in a running
  app, all fatal to `pumpAndSettle`. Replace every call with a bounded
  `pumpUntil(tester, condition, description, timeout: ...)` that pumps in
  short slices until a *specific named widget/state* appears, or fails
  naming exactly what it was waiting for. Because this drives a real network,
  bound the timeout by wall-clock latency, not a frame count.
- **One Chrome, not two.** `-d chrome` launches flutter_tools' own Chrome in
  addition to chromedriver's - two Chrome process trees is often enough to
  blow a container's `pids.max` cgroup limit outright (`pthread_create:
  Resource temporarily unavailable`). `-d web-server` avoids the second one
  entirely; trim the remaining instance further with
  `--web-browser-flag=--disable-dev-shm-usage`,
  `--web-browser-flag=--no-zygote`, `--web-browser-flag=--renderer-process-limit=1`
  if you're still tight on resources.
- **Assert a value the mock provably cannot produce.** Read the mock/fixture
  adapter first, find a value it hardcodes (a name, a holding, a status), and
  assert the *real* account's different value for that same field. A pass
  against a mock that happens to return a plausible-looking name is not
  evidence of anything - it is evidence the mock exists.
- **No minted tokens.** Log in through the actual welcome → sign-in → form →
  passcode UI, tapping real widgets. `AuthTokenStore().clearTokens()` /
  equivalent between test cases for a genuinely fresh device state, never a
  shortcut that injects a session.
- **Screenshot path.** `binding.takeScreenshot(name)` writes wherever your
  test driver script configures - verify the CI upload step's `path:` matches
  it exactly. A wrong path is a silent failure: the job stays green, the
  images are produced and discarded, and screenshots are the only layer that
  catches *wrongness* rather than crashes.
- **Release build only defects exist.** `android.permission.INTERNET`
  declared only in debug/profile manifests (Flutter's template default) is
  invisible to every test that runs in debug or on web - which is all of the
  above. Run the Android-emulator variant against a **release** build at
  least occasionally; it is the only layer that can see this class of bug.

---

## React / Next.js

**Render harness** - headless-browser rendering (Playwright or Puppeteer)
against every route in your router config, plus every modal/drawer/toast
surface that isn't a route. `render()` from React Testing Library is not
equivalent to this layer: it mounts a component in isolation, not the real
app shell, real providers, real client-side routing, or real data fetching -
it will happily render a screen that 404s or infinite-spins in the actual
browser. Use a real browser context (even against a local dev/preview server)
for anything you want to call "rendered."

**Blind spot to name explicitly**: client components behind a feature flag,
an auth gate, or a `searchParams`-driven variant are invisible to a plain
route crawl. Enumerate flag/param combinations you intend to cover, and print
the ones you didn't.

**Live gate** - Playwright driving a real deployed (or locally built +
served, `next build && next start`, never `next dev`) instance against a real
backend:

- **`next dev` is not the artifact that ships.** Fast Refresh, dev-only error
  overlays, and unminified bundles can all mask or introduce behavior a
  production build doesn't have. Build and serve production output for this
  gate, the same way the Flutter live gate refuses to run against a debug
  build for its release-only class of bug.
- **The `pumpAndSettle`-hangs-forever failure mode has a direct analog:**
  `page.waitForLoadState('networkidle')` never resolves if the page has a
  websocket, SSE stream, or polling `setInterval` open - which a correctly
  working real-time feature always does. Wait for a specific selector or
  network response instead of "idle," the same way the Flutter gate replaced
  `pumpAndSettle` with a named, bounded `pumpUntil`.
- **No minted session.** Drive the real login form; if the app uses
  HTTP-only cookies, let Playwright's browser context hold them the way a
  real browser would - don't extract and re-inject a token.
- **Assert a value the mock cannot produce.** Same rule as Flutter: read
  whatever mock/MSW handler your Storybook/unit tests use, find its hardcoded
  fixture value, and assert the live account's different real value.
- **Screenshot every surface visited**, uploaded as a CI artifact - Playwright's
  `page.screenshot()` - for the same reason: assertions catch crashes and
  emptiness, a human scrolling images catches wrongness.

---

## Expo / React Native

**Render harness**: `npx expo export --platform web`, served as static files and
photographed at 390 px wide (light and dark if the product has both) beside the
rendered design artboard.

- **Export with your own cache**: `TMPDIR=<scratch>/tmp npx expo export ...`
  (or `--clear`). The shared Metro cache bakes another agent's API ports into
  the bundle, so a picture can come from the wrong backend.
- **Grep the bundle for `localhost:` before the first picture** and sign-in;
  only your own ports may appear.
- **Name the native-only blind spots in every result**: permission prompts,
  safe-area insets, the software keyboard, push, and release-build behaviour. A
  web export shows none of them.

**Live gate**: the same export pointed at the repo's stand-in backend (see "Who
runs the live gate"), through the real sign-in screen, never an injected session.

---

## Plain HTTP API (no UI)

There is no "render" layer in the visual sense - the closest equivalent is
schema validation: every response actually returned by a live call conforms
to the contract (OpenAPI schema, generated types, whatever is authoritative),
not just to what a handler *claims* to return. Treat "a response shape
declared outside the data layer" (the `wire_types` gate) as equally load-bearing
here - a client-side type that was hand-typed against a guess is exactly how
`undefined.map` on a bare array gets shipped.

**Live gate** - a script (Python/Node, whatever the project already uses)
that:

- **Authenticates through the real auth flow** - real login endpoint, real
  credential exchange - never a token minted by test code or a service
  account with elevated scope the real client never has.
- **Calls real endpoints in the real sequence** a client would (create, then
  read the thing just created, then list it) rather than each endpoint in
  isolation - composition bugs are invisible to endpoints
  tested one at a time.
- **Asserts a value only the live database can produce**: a seeded row's
  server-computed field (a timestamp, a generated id, a joined value from a
  second table), not a value the handler could plausibly return unconditionally.
  If your assertion would also pass against a handler that `return
  {status: "ok"}`-stubs the whole route, it is not a live-gate assertion:
  assert capability, not the absence of errors.
- **Enumerates endpoints it does NOT call** - background jobs, webhook
  receivers, admin-only routes needing a second credential you don't have in
  this pipeline - with the reason, the same way the Flutter/React harnesses
  must name the sheets and flags they can't reach.
- **Runs on a schedule**, not only on push. An API's live gate is usually
  the only thing that would notice a third-party dependency (payment
  provider, KYC provider, market-data feed) silently degrading between
  deploys. The schedule runs in CI against a non-production environment; an
  agent never triggers a call to a payment or identity provider (see "Who runs
  the live gate").

### Changing an API with paying users

Make each of these executable, not prose: a protected-route lock checked against
the base branch (routes real clients call do not change behaviour); a spec that
an old request gets a byte-for-byte identical answer; inventory specs (routes,
rate limits, money fields) where a real new entry is declared with a reason and a
test is never edited to pass; a widened CHECK constraint tested on live-shaped
old rows (old pending, paid and failed rows unchanged, and refused exactly as
before); a rollback script that refuses when it would lose data.
