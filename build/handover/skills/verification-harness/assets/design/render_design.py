#!/usr/bin/env python3
"""Render design artboards to real PNGs, so a screen can be compared to its design.

Until this existed, "matches the artboard" was an opinion. An agent looked at a
screenshot of the app, read the artboard's HTML *source*, and judged. Picture on
one side, code on the other. That is not a comparison, and it is how an entire
tab shipped un-built while every report said the design was covered.

    python3 scripts/design/render_design.py                    # every artboard
    python3 scripts/design/render_design.py 2a 3b              # only these ids
    python3 scripts/design/render_design.py --label "Gallery"  # matching labels
    python3 scripts/design/render_design.py --canvas path/to/canvas
    python3 scripts/design/render_design.py --list             # enumerate only

Run from the repo root. Output: build/design_shots/<id>.png, ready to sit beside
build/shots/<screen>__light.png.

WHY THIS IS HARDER THAN IT LOOKS
--------------------------------
A Claude Design `.dc.html` file is not HTML. It is a React runtime behind custom
elements - `<x-dc>`, `<helmet>`, `<x-import component-from-global-scope="NS.C">`.
`support.js` resolves those into real components at load time, and it FETCHES
React, ReactDOM and @babel/standalone from unpkg.com when it runs. They are not
bundled.

Four ways this renders blank or wrong, every one of them silent:

  * TLS egress is proxied or blocked. The unpkg fetch fails, React never loads,
    nothing mounts, and you get a uniform-coloured PNG. This is the commonest
    one in a sandboxed CI or agent container. --ignore-certificate-errors.
  * The webfonts do not load. The page renders in a fallback face, looks
    plausible, and is worthless as a reference. Worse than blank, because blank
    is obvious.
  * The shot is taken before the runtime has mounted. There is NO ready event.
    `load` and `networkidle` both fire early. The only honest signal is polling
    until zero <x-import> elements remain.
  * The artboard id convention does not match, nothing is found, and a script
    that renders nothing reports success.

Every one of those is checked here, and every one of them exits non-zero.

The artboards are isolated by rendering the ORIGINAL file, unmodified, in place -
a copy beside it with one <style> block appended, deleted afterwards. Extracting
a subtree to its own file breaks the relative paths to `_ds/` and drops the
`support.js` bootstrap, so icons silently vanish while text still renders. That
is exactly the deceptive half-render this script exists to prevent.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path.cwd()
OUT = ROOT / "build/design_shots"

# An artboard wrapper carries data-screen-label (every Claude Design export
# emits it) and usually an id. Neither convention is assumed: ids are matched
# loosely, because hardcoding one project's `s\d+` scheme is what made the
# previous version of this script render zero artboards, silently, in every
# repo but the one it was written in.
LABEL_RE = re.compile(r'data-screen-label="([^"]+)"')
ID_RE = re.compile(r'id="([A-Za-z0-9][A-Za-z0-9_-]{0,40})"')

ISOLATE = """
<style id="__artboard_isolate">
  html, body {{ background: #fff !important; }}
  body * {{ visibility: hidden !important; }}
  {sel}, {sel} * {{ visibility: visible !important; }}
  {sel} {{ position: absolute !important; top: 0 !important; left: 0 !important;
           margin: 0 !important; z-index: 2147483647 !important; }}
</style>
"""

READY_JS = """() => ({
  react: typeof window.React,
  unresolved: document.querySelectorAll('x-import').length,
  height: document.body.scrollHeight,
  fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family)
})"""


def find_canvas(explicit: str | None) -> pathlib.Path | None:
    """Locate the canvas directory instead of assuming its name.

    Order: explicit --canvas, then $DESIGN_CANVAS_DIR, then the shallowest
    directory under the repo that actually contains .dc.html files.
    """
    if explicit:
        return pathlib.Path(explicit).resolve()
    env = os.environ.get("DESIGN_CANVAS_DIR")
    if env:
        return pathlib.Path(env).resolve()
    found = sorted(
        {f.parent for f in ROOT.rglob("*.dc.html") if ".git" not in f.parts},
        key=lambda d: len(d.parts),
    )
    return found[0] if found else None


def enumerate_artboards(canvas: pathlib.Path) -> list[dict]:
    """Every artboard in every canvas file, by label and by id."""
    boards = []
    for f in sorted(canvas.glob("*.dc.html")):
        src = f.read_text(errors="replace")
        for label in dict.fromkeys(LABEL_RE.findall(src)):
            boards.append({"file": f.name, "key": label, "kind": "label"})
        for aid in dict.fromkeys(ID_RE.findall(src)):
            boards.append({"file": f.name, "key": aid, "kind": "id"})
    return boards


def selector_for(board: dict) -> str:
    if board["kind"] == "label":
        esc = board["key"].replace('"', '\\"')
        return f'[data-screen-label="{esc}"]'
    # NOT f'#{id}'. A CSS id selector cannot begin with a digit, and every
    # artboard id in a Claude Design canvas does ("1a", "2b", "3c"). `#1a`
    # is a parse error, so querySelector throws or matches nothing and the
    # artboard is reported as missing rather than as a broken selector.
    esc = board["key"].replace('"', '\\"')
    return f'[id="{esc}"]'


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "artboard"


# ---------------------------------------------------------------- playwright

def render_playwright(canvas, boards, strict_fonts):
    """Preferred path. Only this one can poll for readiness and assert fonts."""
    from playwright.sync_api import sync_playwright

    results, failures = [], []
    by_file: dict[str, list[dict]] = {}
    for b in boards:
        by_file.setdefault(b["file"], []).append(b)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            ignore_default_args=["--headless"],
            # --headless=new renders webfonts and CSS masks correctly; old
            # headless does not. --ignore-certificate-errors is required
            # wherever TLS egress is MITM-proxied, which is most agent
            # sandboxes - without it the unpkg fetch fails and the page is blank.
            args=["--headless=new", "--ignore-certificate-errors",
                  "--disable-gpu", "--no-sandbox", "--hide-scrollbars"],
        )
        for fname, group in by_file.items():
            page = browser.new_page(ignore_https_errors=True,
                                    viewport={"width": 1600, "height": 1200},
                                    device_scale_factor=2)
            page.goto((canvas / fname).as_uri(), wait_until="networkidle",
                      timeout=90_000)
            try:
                # The only honest readiness signal. No event exists.
                page.wait_for_function(
                    "document.querySelectorAll('x-import').length === 0",
                    timeout=45_000)
            except Exception:
                pass
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(1200)

            state = page.evaluate(READY_JS)
            problems = []
            if state["react"] != "object":
                problems.append("React never loaded - TLS egress to unpkg.com "
                                "is blocked or proxied")
            if state["unresolved"]:
                problems.append(f'{state["unresolved"]} <x-import> unresolved')
            if state["height"] < 200:
                problems.append(f'page height {state["height"]}px - nothing rendered')
            if strict_fonts and not state["fonts"]:
                problems.append("no webfonts loaded - every artboard is in a "
                                "fallback face and cannot be trusted visually")
            if problems:
                for b in group:
                    failures.append({"artboard": b["key"], "file": fname,
                                     "why": "; ".join(problems)})
                page.close()
                continue

            for b in group:
                el = page.query_selector(selector_for(b))
                if el is None:
                    failures.append({"artboard": b["key"], "file": fname,
                                     "why": "selector matched nothing"})
                    continue
                box = el.bounding_box()
                if not box or box["height"] < 20 or box["width"] < 20:
                    failures.append({"artboard": b["key"], "file": fname,
                                     "why": "element has no rendered area"})
                    continue
                png = OUT / f"{slug(b['key'])}.png"
                # Element screenshot, not viewport: the artboard's own drawn
                # width decides the shot. Hardcoding a phone window meant
                # desktop artboards could not be rendered at all.
                el.screenshot(path=str(png))
                results.append({"artboard": b["key"], "file": fname,
                                "png": str(png.relative_to(ROOT)),
                                "w": round(box["width"]), "h": round(box["height"])})
            page.close()
        browser.close()
    return results, failures


# --------------------------------------------------------------- chrome CLI

def find_chrome() -> str | None:
    """PATH first, then the usual install locations.

    headless_shell is tried BEFORE the full binary: it is lighter and it keeps
    working in sandboxes where the full Chromium wedges on profile locks.
    """
    import glob as _glob
    for c in ("headless_shell", "chromium", "chromium-browser",
              "google-chrome", "chrome"):
        if subprocess.run(["which", c], capture_output=True).returncode == 0:
            return c
    for pattern in ("/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell",
                    "/opt/pw-browsers/chromium-*/chrome-linux/chrome",
                    "/root/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell",
                    "/root/.cache/ms-playwright/chromium-*/chrome-linux/chrome",
                    "*/.cache/puppeteer/chrome/*/chrome-linux64/chrome"):
        hits = sorted(_glob.glob(pattern)) or sorted(_glob.glob(str(pathlib.Path.home()/pattern)))
        if hits:
            return hits[-1]
    return None


def is_blank(png: pathlib.Path) -> bool:
    """A blank render is a real file of real bytes. Size alone cannot catch it.

    The previous version of this script checked `st_size > 0`, so a uniform
    4KB PNG of a page that never mounted counted as a successful render and
    exited 0.
    """
    if not png.exists() or png.stat().st_size == 0:
        return True
    try:
        from PIL import Image
    except ImportError:
        # Do NOT fall back to a size heuristic. A blank 430x1500 PNG is ~16KB,
        # which passes any threshold loose enough not to reject real renders.
        raise SystemExit(
            "Pillow is required to tell a real render from a blank one.\n"
            "  pip install Pillow --break-system-packages\n"
            "Refusing to guess: a blank PNG reported as a successful render "
            "invalidates every comparison made against it.")
    im = Image.open(png).convert("RGB")
    colors = im.getcolors(maxcolors=4096)
    return colors is not None and len(colors) <= 3


def render_chrome(canvas, boards, chrome):
    results, failures = [], []
    for b in boards:
        f = canvas / b["file"]
        src = f.read_text(errors="replace")
        page = src.replace("</body>", ISOLATE.format(sel=selector_for(b)) + "</body>", 1) \
            if "</body>" in src else src + ISOLATE.format(sel=selector_for(b))
        tmp = f.with_name(f"_render_{slug(b['key'])}.html")
        tmp.write_text(page)
        png = OUT / f"{slug(b['key'])}.png"
        try:
            subprocess.run(
                [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
                 "--hide-scrollbars", "--ignore-certificate-errors",
                 "--window-size=1600,2400",
                 "--virtual-time-budget=20000",
                 f"--screenshot={png}", str(tmp)],
                capture_output=True, timeout=180)
        finally:
            tmp.unlink(missing_ok=True)
        if is_blank(png):
            png.unlink(missing_ok=True)
            failures.append({"artboard": b["key"], "file": b["file"],
                             "why": "rendered blank - React likely never loaded "
                                    "(TLS egress to unpkg.com)"})
        else:
            results.append({"artboard": b["key"], "file": b["file"],
                            "png": str(png.relative_to(ROOT))})
    return results, failures


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="artboard ids or labels; default all")
    ap.add_argument("--canvas")
    ap.add_argument("--label", help="substring match on data-screen-label")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--allow-fallback-fonts", action="store_true",
                    help="do not fail when no webfont loaded (you are asserting "
                         "the comparison does not depend on type)")
    args = ap.parse_args()

    canvas = find_canvas(args.canvas)
    if canvas is None or not canvas.is_dir():
        print("no .dc.html canvas found. Pass --canvas <dir> or set "
              "DESIGN_CANVAS_DIR.", file=sys.stderr)
        return 2

    boards = enumerate_artboards(canvas)
    if not boards:
        print(f"no artboards found in {canvas}. The canvas files carry neither "
              "data-screen-label nor usable ids - check the export.",
              file=sys.stderr)
        return 2

    if args.list:
        for b in boards:
            print(f'{b["kind"]:5}  {b["key"]:50}  {b["file"]}')
        return 0

    if args.ids:
        wanted = set(args.ids)
        boards = [b for b in boards if b["key"] in wanted]
    if args.label:
        boards = [b for b in boards
                  if b["kind"] == "label" and args.label.lower() in b["key"].lower()]
    if not boards:
        print("no artboard matched the selection. Run --list to see what exists.",
              file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)

    try:
        import playwright  # noqa: F401
        results, failures = render_playwright(canvas, boards,
                                              strict_fonts=not args.allow_fallback_fonts)
        engine = "playwright"
    except ImportError:
        chrome = find_chrome()
        if not chrome:
            print("neither playwright nor chrome/chromium available - cannot "
                  "render. pip install playwright --break-system-packages && "
                  "python3 -m playwright install chromium", file=sys.stderr)
            return 2
        results, failures = render_chrome(canvas, boards, chrome)
        engine = "chrome-cli"

    if args.json:
        print(json.dumps({"engine": engine, "canvas": str(canvas),
                          "rendered": results, "failed": failures}, indent=2))
    else:
        print(f"rendered {len(results)} artboard(s) into "
              f"{OUT.relative_to(ROOT)} via {engine}")
        for f in failures:
            # Never a silent skip. A missing render that nobody mentions
            # becomes a screen nobody compared, reported as a screen that
            # matched.
            print(f'  NOT RENDERED, so NOT verified: {f["artboard"]} - {f["why"]}')

    # Zero rendered is a failure, not a clean run.
    if not results:
        return 2
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
