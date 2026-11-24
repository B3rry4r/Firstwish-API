# Measurement reference

How to get real numbers out of a running frontend. Everything here was used in
anger; the thresholds come from defects that shipped.

## Why measure at all

Every technique below exists because reasoning failed in a specific way:

- A class can be present and **inert**. A global `a:hover` out-weighed every
  Tailwind text-colour utility in an app; the classes were all correct and none
  of them applied.
- A hover can exist and be **invisible**. Measured at 1.01 to 1.20:1 against the
  surface the control sat on, it was a no-op the user perceived as a dead button.
- A fix can be verified by argument and still be wrong. A specificity fix
  computed on paper "solved" the purple-link bug by silently disabling every
  deliberate hover in the app. One browser check would have caught it.

If you find yourself computing specificity by hand or predicting a layout,
stop and render it.

## Driving the browser

Chrome + CDP over a raw WebSocket is enough; no Playwright dependency needed.
Node 22 has a global `WebSocket`.

Ports, profile dir and bundler cache are assigned to you in the brief. Never
use fixed numbers from an example: another agent's server will already hold
them, and a shared cache or profile leaks between agents.

```bash
# APP_PORT, CDP_PORT, SCRATCH come from your brief
export TMPDIR=$SCRATCH/tmp            # your own bundler cache, not the shared one
# Start the app (a dev server is fine for layout; cascade questions need the built CSS, see 4).
# Start node itself, never `npx` or an npm script: `$!` of a wrapper is the wrapper's PID,
# and killing it leaves the real server listening.
node node_modules/next/dist/bin/next dev -p $APP_PORT > $SCRATCH/logs/dev.log 2>&1 &
# Record the PID that owns the port (a dev server may fork a worker): wait until it listens,
# then read it from the socket. `lsof -tiTCP:$APP_PORT -sTCP:LISTEN` does the same if ss is missing.
timeout 120 bash -c "until ss -ltn 'sport = :$APP_PORT' | grep -q LISTEN; do sleep 2; done"
ss -ltnp "sport = :$APP_PORT" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 > $SCRATCH/dev.pid

# Headless Chrome with a debugging port and your own profile
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --remote-debugging-port=$CDP_PORT --user-data-dir=$SCRATCH/cdp-profile \
  > $SCRATCH/logs/chrome.log 2>&1 &  echo $! > $SCRATCH/chrome.pid
```

Before the first measurement, grep the served bundle for `localhost:`; only your
own ports may appear. A shared cache once baked another agent's ports into a
build, and every picture came from the wrong server.

```js
// Open a target and connect
const tgt = await (await fetch(
  `http://127.0.0.1:${process.env.CDP_PORT}/json/new?http://localhost:${process.env.APP_PORT}/some/route`,
  { method: 'PUT' })).json();
const sock = new WebSocket(tgt.webSocketDebuggerUrl);
let id = 0; const waiting = new Map();
sock.onmessage = e => { const m = JSON.parse(e.data);
  if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
await new Promise(r => sock.onopen = r);
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; waiting.set(i, res);
  sock.send(JSON.stringify({ id: i, method, params }));
});
await send('DOM.enable'); await send('CSS.enable'); await send('Page.enable');
```

**Always `process.exit(0)` at the end**: an open WebSocket keeps node alive and
the run looks like a hang.

### Authenticated routes

Seed the session in `localStorage` *before* navigating, or every protected route
redirects and you measure the login page N times. Read the app's own
session-storage module for the exact keys; do not guess them. Seed both a
plain-user and a privileged session so both branches can be measured.

```js
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `localStorage.setItem('<key>', ${JSON.stringify(sessionJson)});`
});
```

## What to measure

### 1. Layout boxes

```js
const { root } = (await send('DOM.getDocument', { depth: -1 })).result;
const { nodeIds } = (await send('DOM.querySelectorAll',
  { nodeId: root.nodeId, selector: 'div,section,article,button,a' })).result;
// per node: DOM.getBoxModel  → width/height
//           DOM.getOuterHTML → text content for the "is this one sentence?" test
```

Flag:
| Signal | Threshold | Why |
|---|---|---|
| Block holding one short sentence | width > ~700px | Reads as a stretched bar, not a card |
| Button | width > ~420px | A full-bleed button in a wide column |
| Card aspect ratio | > ~6:1 with little content | The "long card" complaint |
| Grid track with ONE item | spans the full row | `auto-fit` collapses empty tracks; `auto-fill` keeps them |
| Body | `scrollWidth > clientWidth` | Horizontal overflow, always a bug |

The `auto-fit`/`auto-fill` distinction is worth grepping for directly. It is
invisible until exactly one item is present, so it survives every test with
seeded lists and breaks on the empty-ish real account.

### 2. Header and back-control consistency

Measure ACROSS routes, then compare; a single route always looks fine.

Per route record: header height, the title's `x`, the back control's centre `y`
and the title's centre `y`, and the right-most control's right edge. Report the
**variance**. High variance almost always means several screens each drew their
own header instead of using a shared one; that is the finding, and the fix is
one component rather than N nudges.

### 3. Interaction states (the highest-yield check)

For each interactive element: read the resting background, force `:hover`, read
it again, and compute the contrast ratio between the two.

```js
await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
// ...read matched rules / computed style...
await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
```

**Two traps here, and both produce confident false findings.**

*First:* `CSS.getComputedStyleForNode` does not always reflect a forced
pseudo-state. `CSS.getMatchedStylesForNode` DOES: it returns the matched rules
in increasing precedence order, so the **last** matching rule wins. That list is
the authoritative answer to "which rule applies", and it is also how you settle
a cascade question without arithmetic (§4).

*Second, and worse because the number looks plausible:* **headless Chrome
reports `hover: none` and `pointer: none`**, so any rule inside
`@media (hover: hover)` never matches. Tailwind wraps its `hover:` variants in
exactly that query by default. A census run without fixing this reports **zero
hover states on a page where every control has one**, and the agent then
"fixes" a bug that does not exist. Launch with:

```
--blink-settings=availableHoverTypes=2,availablePointerTypes=4
```

Sanity-check before trusting any hover census: pick one control you *know* has a
hover and confirm the measurement sees it. A census that says 0 of N is far more
likely to be a broken probe than a broken app.

*Third, on wrapping:* do not infer a wrapped line from element height against
line-height; padding makes that lie, and it flagged 13 table headers that had
not wrapped at all. `scrollWidth > clientWidth`, or a Range client-rect count,
is the honest test.

Thresholds:
- Hover vs the surface the control sits on: **≥ 1.3:1**. Below that it is
  invisible; 1.05:1 is a control that does nothing when you point at it.
- Also check hover against the control's **own** resting fill: a hover that
  matches the page but not the button is still a no-op on the button.
- Every interactive element needs a **cursor**. Tailwind preflight does NOT set
  `cursor: pointer` on `<button>`. Check it explicitly; an app can ship with a
  hundred controls that never change the cursor.
- `:focus-visible` must be reachable by keyboard and visible when it is.

Count the whole population, do not sample. "103 of 114 buttons have no hover"
is a finding; "some buttons look fine" is not.

### 4. Cascade questions

Never compute specificity by hand. Build the app, serve the built CSS, and read
`CSS.getMatchedStylesForNode` for a representative element of each disputed
class. Check all the cases at once, e.g. for a link-colour rule: an unclassed
anchor, one with a resting colour class and no hover, one with an explicit
hover utility, and one with a destructive colour. A fix that repairs one and
breaks another is the normal outcome, and only this test shows it.

Two gotchas:
- A build served alongside a running dev server can collide over the output
  directory; build to a separate `distDir` or stop the dev server.
- PostCSS may strip `@layer` from an `@import`, so a cascade-layer fix can
  silently not survive compilation. Check the built stylesheet for the rule you
  think you wrote.

### 5. Text wrapping

At the narrowest supported width, flag any single-line control whose text wraps:
compare `clientHeight` against the line-height, or check `scrollWidth >
clientWidth` on the text node's parent. Search fields and nav labels are the
usual offenders.

### 6. Screenshots

`Page.captureScreenshot` into a review folder: a task agent takes one light/dark pair per changed screen at the narrowest width (T2 pay screens: every drawn state); the once-per-batch sweep takes every route at every breakpoint.
Automated checks catch crashes, emptiness and invisibility. They do not catch
ugliness. The screenshots are how a human catches the rest in one scroll, and
they are the single highest-value artifact of this phase.

## Viewports

Set with `Emulation.setDeviceMetricsOverride`.

| Name | Size | Why |
|---|---|---|
| phone-min | **360 x 740** | **Measure here FIRST where phones are the primary device**: the honest worst case |
| mobile | 390 x 844 | The common phone; wrapping and tap targets |
| desktop-min | **1280 x 800** | **Measure here FIRST where desktop is the primary device** |
| desktop | 1440 x 900 | The common laptop |

Worst case first means the narrowest supported width of the primary device. On
every page that takes money or input, assert
`document.documentElement.scrollWidth <= window.innerWidth` at 360 and 390;
overflow there is a blocker. A payment page ran 13 px past every phone screen
for about 2 days because no check ran at phone width first.

Do not measure only at wide widths. "Stop acting like every PC is a 4K screen"
is a real quote from a real product owner, said after several fixes that were
each verified at a width where the bug did not appear.

## Cleaning up (not optional)

**Kill every process you start, by PID**: the dev server (the node PID, not the
wrapper script's), Chrome and its children, any static file server. Never
`pkill`, `killall` or `pgrep -f`: on a machine shared with other agents they
kill other agents' servers and builds. Removing a worktree does not stop the
servers running from it (17 orphans were found once). Before hand-back,
`ss -ltnp` on your ports must show nothing of yours.

```bash
# dev.pid holds the PID read from the port, not a wrapper's; chrome.pid is the browser itself
kill "$(cat $SCRATCH/dev.pid)" "$(cat $SCRATCH/chrome.pid)"   # then check the children
ss -ltnp | grep -E ":($APP_PORT|$CDP_PORT)\b"                  # expect no output
```

This is not tidiness. Leaked processes from finished agents (one 5GB dev server
and a Chrome fleet, still running eleven hours later) starved a machine until
`npm` could not fork, `jest` timed out at 9 minutes on a suite that takes 11
seconds, and roughly twenty minutes went into diagnosing an environment failure
that looked exactly like a code failure.

**The symptom to recognise, because it does not look like what it is.** The
binding limit is often **PIDs, not memory**: a container cgroup commonly caps
at 1000, and Chrome plus a dev server can hold 900 of them in threads while
`free` still reports hundreds of gigabytes available. What you see is:

- `npm error code EAGAIN` / `spawn sh EAGAIN`
- a Rust/SWC panic: *"The global thread pool has not been initialized ...
  Resource temporarily unavailable"*
- a test suite that normally runs in 11 seconds timing out at 9 minutes
- `jest --listTests` and `prisma migrate status` hanging, commands that do
  almost nothing

Every one of those reads as a code or database problem. Check the real number
first:

```bash
cat /sys/fs/cgroup/pids.current   # against /sys/fs/cgroup/pids.max
```

In the session that produced this file, that ratio was 903/1000 and the fix was
killing leaked browsers, after roughly forty minutes spent debugging "flaky
tests" and "a broken build" that were neither.

**A memory kill looks like a code failure too.** A jest worker ending in
`signal=SIGKILL`, or a server that dies with no error, was killed for memory,
not by your code. Wait until `free -g` shows 5 GB available, then run it again.
Keep one browser and one dev server of yours at a time, and start a heavy job
only when `free -g` shows 5 GB. Nine agents on 4 CPUs and 15 GB produced kills,
flaky timing tests and re-runs.
