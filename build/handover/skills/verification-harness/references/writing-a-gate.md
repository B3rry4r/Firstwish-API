# Writing a gate

A gate is one module in `checks/`, named to match its key in `gates.config.json`,
exposing:

```python
def run(ctx: Context) -> Iterable[Finding]:
    ...
```

`run.py` imports it by name (`importlib.import_module(f"checks.{name}")`) - get
the filename and the config key wrong relative to each other and the harness
exits 2 with "gate has no implementation," not a silent no-op. That is
deliberate: a misconfigured gate should look broken, not look clean.

## What `Context` gives you

Never touch paths or `gates.config.json` directly - go through `ctx`:

- `ctx.source_files(kind="source")` - files in a named group from
  `config["files"]`, globbed and de-duplicated, with `config["files"]["exclude"]`
  already applied.
- `ctx.rel(path)` - path relative to the repo root, POSIX-separated, for
  `Finding.path`.
- `ctx.lines(path)` - `(lineno, text)` pairs, 1-indexed, tolerant of encoding
  errors.
- `ctx.is_test(path)` - matches `config["files"]["test"]` globs. Most gates
  should skip test files (fixtures legitimately reference `Mock*`, comments
  legitimately say `TODO`); a couple, like `deferrals`, take an
  `include_tests` option because the phrase itself is still worth catching.
- `ctx.gate_config` - this gate's own block from `gates.config.json`
  (`ctx.gate_config.get("token_layer", [])`, etc.). Put anything your gate
  needs to be configurable here, not in a Python constant - a constant means
  every adopting repo edits your source to reconfigure it.

## `Finding`

```python
Finding(gate=NAME, path=rel, line=lineno, message="...", evidence=line)
```

- `severity` defaults to `"fail"`. Set `"warn"` for a signal worth surfacing
  but not worth blocking a build over (see `dead_controls.py`'s
  `onPressed: null` case - legitimate as a disabled-button state, so it warns
  instead of failing, because a static gate cannot tell "permanently disabled"
  from "conditionally disabled" apart).
- **`key()` deliberately excludes the line number.** It hashes
  `gate + path + evidence[:200] + message`. Inserting a line above a known,
  accepted finding must not resurrect it as "new" - that would make the
  baseline worthless the first time anyone reformats a file. Evidence text
  (not line number) is what identifies a finding across edits, so keep
  `evidence` set to the actual offending line, not a paraphrase - two
  findings with different evidence hash differently even if `message` is
  identical.
- A gate can be downgraded to warn-only globally, during adoption, by setting
  `"severity": "warn"` on its block in `gates.config.json` - `run_gate()`
  applies that after your `run()` returns, so you never need to read that
  setting yourself.

## Keep it quiet: the two-tier pattern

A gate that fires on legitimate code gets switched off, and a switched-off
gate is worse than no gate - it still reads as coverage in the README table.
`checks/deferrals.py` is the reference for how to stay quiet without going
blind:

- **Tier A** - phrases that are an admission on their own: `out of scope`,
  `TODO`/`FIXME`/`HACK`, `not yet implemented`, `will be added`. Any of these
  fires unconditionally.
- **Tier B** - phrases that are ordinary engineering English *until* they sit
  next to a temporal marker. `mock`, `stub`, `placeholder`, `wire`, `replace`
  are all things a comment can legitimately say about work that already
  happened ("kept as a local stub because models.dart was out of scope for
  this pass" is provenance, not a deferral). Tier B only fires when a
  `DEFERRAL_MARKER` - `later`, `until`, `once`, `pending`, `before ship`,
  `next wave`, `for now`, `revisit`, etc. - also appears in the same comment.

Describing what a system **does** is not a deferral. Promising what it will do
**later** is. If your new gate's pattern can plausibly appear in a comment
that is just explaining a shipped decision, give it the same two-tier
treatment before enabling it by default.

## When a gate is wrong

A gate is code, and code has bugs in both directions - false positives that
teach people to ignore it, and false negatives that let the exact defect it
was written for back in. Two from this harness's own history, worth reading
as worked examples before you ship a new pattern:

1. **`hardcoded_signals.py`'s color check originally flagged every
   `Color(0x........)` literal**, including `Color(0x00000000)` - fully
   transparent - and alpha-only black/white scrims. Transparent is not a
   brand colour; a token layer cannot express "40% black scrim" any better
   than the literal does. The fix, `_is_overlay_or_transparent()`, computes
   RGB spread and average brightness and only exempts literals with *no real
   hue* (alpha=0, or near-grey and near-black/near-white). A real hue like a
   chart purple still fires. Read the function before assuming "just ignore
   `0x00......`" is the right fix - the actual boundary is chroma, not the
   alpha channel alone.
2. **`check_baseline.py`'s placeholder check originally included `""` in its
   list of banned placeholder prefixes.** `"anything".startswith("")` is
   `True` in Python - so a genuinely good owner name and a genuinely good
   reason both matched the "this looks like a placeholder" check, and every
   valid baseline entry failed CI. The fix: emptiness is handled separately,
   by a length check (`len(owner) < 2`), and `PLACEHOLDERS` never contains the
   empty string. If you add a new "reject this pattern" list anywhere in a
   gate, ask what an empty string does to it before shipping.

Test a new gate against both a file it should flag and a file that looks
similar but shouldn't, before enabling it with `"severity": "fail"`.

## Config-only extension

Two gates need no new code at all:

- **`product_invariants`** - add an entry to its `"banned"` array in
  `gates.config.json`: a regex, a `ruling` id, and a `why`. It only scans
  string literals in source (not comments), so "we removed the risk profile
  here" in a comment never trips it - only the literal shipping again would.
  Use this for banned product language, a retired feature name that keeps
  coming back, or a claim the backend cannot back.
- **`provisional`** - no config at all. Any file, any comment, matching
  `PROVISIONAL(id, owner=..., why=...)`. See SKILL.md for the marker format
  and its warn/fail split on `GATES_RELEASE`.

Prefer extending these over writing a new gate module when the shape fits -
fewer regexes to maintain, and the baseline/severity machinery is already
correct.
