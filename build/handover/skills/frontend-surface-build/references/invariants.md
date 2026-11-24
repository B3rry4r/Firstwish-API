# Product invariants as executable checks

A product rule enforced by memory is re-broken by the next agent, usually within
the hour. In the session that produced this skill a banned word was swept out of
the entire codebase and then reappeared **in five places in code written later
the same day**, because the sweep was a one-off grep and the rule lived only in
a document.

Ship the rule as a script. If it is not executable, it is not a rule.

## The categories worth checking

Derive the specific values from the product's own docs; these are the shapes.

| Category | What it catches | Example rule |
|---|---|---|
| Banned vocabulary | Words the product does not use | "free" → "at no charge" / "included" / "₦0" |
| Currency | Wrong currency leaking in | Naira only; never `$`, `USD`, "dollars" |
| Forbidden concepts | Features the product does not have | No wallet, no cash balance, no "cash out" |
| Unit confusion | A count rendered as money or vice versa | Credits are a COUNT, never a naira value |
| Design tokens | Hardcoded values bypassing the token layer | No raw hex, spacing or radius in components |
| Iconography | An icon implying a forbidden concept | A `Wallet` icon in a product with no wallet |
| Component ownership | Forks of shared UI | Two exports of one component name |

**An icon is copy.** A `Wallet` icon labelling an Earnings row shipped in a
product whose spec says "no wallet, ever": the word was absent and the concept
was not.

## Writing the check so it is trusted

A noisy check gets ignored, and an ignored check is worse than none because it
provides false assurance. Two rules:

**1. Look only at user-visible strings.** Strip comments, then take JSX text
nodes and quoted literals. A literal with no whitespace is almost always a prop
value or a union member (`state="free"`, `variant="ghost"`): code, not copy.
Skipping those removed most of the false positives in practice.

```js
function visibleStrings(src) {
  const cleaned = src
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
    .replace(/^\s*\/\/.*$/gm, "");      // line comments
  const out = [];
  for (const m of cleaned.matchAll(/>([^<>{}]*?)</gs))
    if (m[1].trim()) out.push([m[1], m.index]);
  for (const m of cleaned.matchAll(/"([^"\n]{4,})"/g))
    if (/\s/.test(m[1])) out.push([m[1], m.index]);  // a sentence has a space
  return { out, cleaned };
}
```

**2. Allow the copy that exists to state the rule.** "<Brand> never holds a cash
balance and there is no cash-out flow" is the product being explicit, not a
violation. Allow a negation in the same sentence:

```js
allow: [
  /\b(no|not|never|n't|cannot|can't|without)\b[^.]{0,80}(wallet|cash|withdraw)/i,
  /(wallet|cash|withdraw)[^.]{0,80}\b(no|not|never|n't|cannot|can't)\b/i,
]
```

Getting these two things right took a check from 17 false positives to zero.

## Shape

```js
const RULES = [
  { id: "no-free",  test: /\bfree\b/i,            allow: [/freeSlots|free-|font-/] },
  { id: "no-dollars", test: /\$\d|USD\b|dollars?\b/i, allow: [/\$\{/] },
  { id: "no-wallet", test: /\bwallet\b|cash out\b|withdraw/i, allow: [/* negations */] },
];
// walk src/**/*.tsx → visibleStrings → test each rule → print file:line + rule id
// exit(1) on any violation
```

Wire it to a script (`npm run check:copy`) and into CI. Each rule carries a
comment saying **why** it exists; the next person to hit a failure needs to
know whether to fix the copy or the rule.

## Beyond copy

The same file is the right home for the structural invariants, all greppable:

- **Fork detection**: the same component name exported from two files; two
  declarations of one type or class name. (Two `ApiError` classes in one repo
  means an `instanceof` check can silently fail against the wrong one. A second
  `ErrorState` three files from the real one shipped a hardcoded "check your
  connection" message that told users a 403 was a network failure.)
- **Hand-typed wire shapes**: response interfaces declared in page or component
  files instead of imported from the contract types.
- **Hardcoded design values**: raw hex, px spacing, px radius in component
  files, where a token layer exists.

## Maintaining it

When a product rule changes, change the check in the same commit. A rule the
check no longer enforces is a rule that no longer exists, which is fine, as
long as it is deliberate rather than discovered six weeks later.
