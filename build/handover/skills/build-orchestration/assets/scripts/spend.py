#!/usr/bin/env python3
"""spend.py: what a multi-agent build cost, read from the session transcripts. Short output.

usage: spend.py --dir <subagents dir> [--lead <lead transcript.jsonl>] [--prices prices.json]
                [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--top 6] [--json out.json]

Where the files are (Claude Code): ~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl, each with an
agent-*.meta.json whose "description" is the label you gave the agent at spawn, and the lead's own transcript
at ~/.claude/projects/<project>/<session>.jsonl. Give every agent a label like "Build TASK-12" or
"Verify TASK-12 round 2": the report groups by task, role and round from that label.

What it prints: cost per agent; cost by agent length (steps), because each step re-reads the whole context;
cost by fix round; idle gaps past the cache window (300 s) that forced the cache to be written again; top tasks and agents.

Prices are USD per million tokens: input, output, cache read, cache write 5m, cache write 1h. The defaults are
the table the WAWU numbers were computed with. Prices change: pass --prices with the provider's current
table, {"sonnet": [in, out, read, w5, w1h], ...}, matched by model-name substring.
"""
import argparse, collections, glob, json, os, re, sys
from datetime import datetime

# WORKED-EXAMPLE RATES, NOT CURRENT PRICES. These are the rates the WAWU build's numbers (references/costs.md)
# were computed with, kept so that example can be reproduced. Do not quote them as facts: look up the provider's
# current table and pass it with --prices.
DEFAULT_PRICES = {
    "opus": [4, 20, 0.20, 5.0, 8.0],
    "sonnet": [2, 10, 0.20, 2.5, 4.0],
    "haiku": [0.10, 0.50, 0.01, 0.125, 0.2],
}
IDLE_SECONDS = 300  # seconds; the cache lapses at 300 s, agents look again within 4 minutes


def parse_ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def family(model, prices):
    for k in prices:
        if k in (model or ""):
            return k
    return None


def load_steps(path):
    """One entry per distinct assistant message id: tokens by kind, model, time."""
    steps, seen = [], {}
    with open(path, errors="ignore") as fh:
        for line in fh:
            if '"usage"' not in line:
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("type") != "assistant":
                continue
            m = d.get("message") or {}
            u, mid = m.get("usage"), m.get("id")
            if not u or not mid:
                continue
            if mid in seen:
                s = seen[mid]
                s["out"] = max(s["out"], u.get("output_tokens") or 0)
                continue
            cc = u.get("cache_creation") or {}
            w1h = cc.get("ephemeral_1h_input_tokens", 0) or 0
            w5 = max((u.get("cache_creation_input_tokens", 0) or 0) - w1h, 0)
            s = dict(model=m.get("model"), ts=parse_ts(d.get("timestamp")), inp=u.get("input_tokens", 0) or 0,
                     out=u.get("output_tokens", 0) or 0, cr=u.get("cache_read_input_tokens", 0) or 0, w5=w5, w1h=w1h)
            s["ctx"] = s["inp"] + s["cr"] + s["w5"] + s["w1h"]
            seen[mid] = s
            steps.append(s)
    return steps


def step_cost(s, p):
    return (s["inp"] * p[0] + s["out"] * p[1] + s["cr"] * p[2] + s["w5"] * p[3] + s["w1h"] * p[4]) / 1e6


def label_of(path):
    meta = path[:-6] + ".meta.json"
    try:
        return (json.load(open(meta)).get("description") or "").strip()
    except (OSError, ValueError):
        pass
    try:
        for line in open(path, errors="ignore"):
            d = json.loads(line)
            if d.get("type") == "user":
                c = (d.get("message") or {}).get("content")
                return re.sub(r"\s+", " ", c if isinstance(c, str) else json.dumps(c))[:60]
    except (OSError, ValueError):
        pass
    return os.path.basename(path)


def analyse(path, prices, a):
    steps = load_steps(path)
    if not steps:
        return None
    fam = family(steps[0]["model"], prices)
    p = prices.get(fam) if fam else None
    cost = sum(step_cost(s, p) for s in steps) if p else 0.0
    read_cost = sum(s["cr"] * p[2] for s in steps) / 1e6 if p else 0.0
    lapses, extra = 0, 0.0
    gaps = 0
    for prev, cur in zip(steps, steps[1:]):
        if not (prev["ts"] and cur["ts"]):
            continue
        if (cur["ts"] - prev["ts"]).total_seconds() > IDLE_SECONDS:
            gaps += 1
            # a lapse is confirmed when the step after the gap wrote most of the context again
            if p and cur["w5"] >= 0.5 * prev["ctx"]:
                lapses += 1
                extra += max(cur["w5"] - max(cur["ctx"] - prev["ctx"], 0), 0) * (p[3] - p[2]) / 1e6
    label = label_of(path)
    rm = re.search(a.round_regex, label, re.I)
    tm = re.search(a.task_regex, label)
    return dict(label=label, model=fam or (steps[0]["model"] or "?"), priced=bool(p), steps=len(steps), cost=cost,
                maxctx=max(s["ctx"] for s in steps), start=steps[0]["ctx"], read_cost=read_cost,
                gaps=gaps, lapses=lapses, lapse_usd=extra, day=(steps[0]["ts"] or datetime.min).strftime("%Y-%m-%d"),
                role="check" if re.search(a.check_regex, label, re.I) else "build",
                round=int(rm.group(1)) if rm else 1, task=tm.group(1).upper() if tm else label[:30])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dir", required=True, help="folder holding agent-*.jsonl")
    ap.add_argument("--lead")
    ap.add_argument("--prices")
    ap.add_argument("--since")
    ap.add_argument("--until")
    ap.add_argument("--top", type=int, default=6)
    ap.add_argument("--json")
    ap.add_argument("--round-regex", default=r"(?:round\s*|\br)(\d+)\b")
    ap.add_argument("--task-regex", default=r"\b([A-Za-z]+-\d+[A-Za-z0-9]*)\b")
    ap.add_argument("--check-regex", default=r"^\s*(verif|check|audit|review)")
    a = ap.parse_args()
    prices = dict(DEFAULT_PRICES)
    src = "worked-example rates, NOT current prices (pass --prices)"
    if a.prices:
        prices = json.load(open(a.prices))
        src = a.prices
    rows = []
    for f in sorted(glob.glob(os.path.join(a.dir, "agent-*.jsonl"))):
        r = analyse(f, prices, a)
        if r and (not a.since or r["day"] >= a.since) and (not a.until or r["day"] <= a.until):
            rows.append(r)
    if not rows:
        print("no agent transcripts found in", a.dir)
        return 1
    tot = sum(r["cost"] for r in rows)
    models = collections.Counter(r["model"] for r in rows)
    print(f"SPEND  prices: {src}  agents {len(rows)}  ${tot:,.0f}  models {dict(models)}")
    unpriced = [m for m, n in models.items() if not any(m == r["model"] and r["priced"] for r in rows)]
    if unpriced:
        print("  UNPRICED (counted as $0, add them to --prices):", ", ".join(unpriced))
    if tot <= 0:
        print("nothing is priced: no agent cost could be computed. Pass --prices with a rate for each model above.")
        return 1
    if a.lead and os.path.exists(a.lead):
        lst = [s for s in load_steps(a.lead) if s["ts"] and (not a.since or s["ts"].strftime("%Y-%m-%d") >= a.since)
               and (not a.until or s["ts"].strftime("%Y-%m-%d") <= a.until)]
        by = collections.defaultdict(lambda: [0, 0.0])
        for s in lst:
            fam = family(s["model"], prices)
            by[fam or s["model"] or "?"][0] += 1
            by[fam or s["model"] or "?"][1] += step_cost(s, prices[fam]) if fam else 0
        print("  lead: " + ", ".join(f"{k} {n} steps ${c:,.0f}" for k, (n, c) in by.items()))
    med = sorted(r["start"] for r in rows)[len(rows) // 2]
    print(f"  cache-read share of agent cost {100 * sum(r['read_cost'] for r in rows) / tot:.0f}%   "
          f"start context median {med // 1000}k tokens")
    print("BY LENGTH   steps      n   $total   $/step  avg max ctx")
    for lo, hi in [(0, 100), (100, 200), (200, 300), (300, 10 ** 9)]:
        rr = [r for r in rows if lo <= r["steps"] < hi]
        if rr:
            c, n = sum(r["cost"] for r in rr), sum(r["steps"] for r in rr)
            print(f"  {lo:>3}-{('up' if hi > 10 ** 6 else hi):<7}{len(rr):>7} {c:>8,.0f} {c / n:>8.3f} {sum(r['maxctx'] for r in rr) // len(rr) // 1000:>8}k")
    print("BY ROUND (a build and its checks count together)   n   $total  share")
    rd = collections.defaultdict(lambda: [0, 0.0])
    for r in rows:
        k = min(r["round"], 4)
        rd[k][0] += 1
        rd[k][1] += r["cost"]
    for k in sorted(rd):
        print(f"  round {k}{'+' if k == 4 else ' '}{rd[k][0]:>38} {rd[k][1]:>8,.0f} {100 * rd[k][1] / tot:>5.0f}%")
    for role in ("build", "check"):
        rr = sorted(r["cost"] for r in rows if r["role"] == role)
        if rr:
            print(f"  {role}: n {len(rr)}  sum ${sum(rr):,.0f}  median ${rr[len(rr) // 2]:.1f}")
    g, l, x = sum(r["gaps"] for r in rows), sum(r["lapses"] for r in rows), sum(r["lapse_usd"] for r in rows)
    print(f"IDLE  gaps past the cache window (300 s) {g}, cache written again after {l}, extra ${x:,.0f} ({100 * x / tot:.0f}% of agent spend)")
    tasks = collections.defaultdict(lambda: [0.0, 0, 0])
    for r in rows:
        t = tasks[r["task"]]
        t[0] += r["cost"]
        t[1] += 1
        t[2] = max(t[2], r["round"])
    print(f"TOP TASKS  (cost, agents, highest round)")
    for k, (c, n, rd_) in sorted(tasks.items(), key=lambda kv: -kv[1][0])[: a.top]:
        print(f"  {k:<28}${c:>6,.0f}  {n:>3} agents  round {rd_}")
    print("TOP AGENTS  (cost, steps, max context)")
    for r in sorted(rows, key=lambda r: -r["cost"])[: a.top]:
        print(f"  {r['label'][:34]:<36}${r['cost']:>6,.1f}  {r['steps']:>4} steps  {r['maxctx'] // 1000}k")
    if a.json:
        json.dump(dict(rows=rows, total=tot), open(a.json, "w"), default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
