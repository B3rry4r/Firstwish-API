#!/usr/bin/env python3
"""Cost and duration estimate for a planned build, on the tiered workflow (effort tiers, bundles, max 2 rounds).

Usage:
    python3 estimate.py --tasks tasks.csv [--params params.json] [--plans N] [--deadline-days D] [--out plan-data.json]

tasks.csv columns: id,area,title,size,kind,tier,bundle,depends_on,source,wait_days
  size: S | M | L (empty for owner items). L should be rare: split it if you can.
  kind: design | backend | app | web | admin | qa | ops | release | owner
  tier: T0 | T1 | T2 (see SKILL.md); empty means T1
  bundle: a bundle id shared by 2 to 5 tasks of one area that one builder and one verifier take together; empty = alone
  depends_on: task ids separated by ';'
  wait_days: owner items only, calendar days the owner needs

Every constant is the WAWU build's measurement (Oct 2026) unless marked ASSUMED; override any of them with
--params (a JSON object with the same keys) and recalibrate after the first week.
"""
import argparse
import csv
import json
import math
import sys
from collections import defaultdict

DEFAULTS = {
    # Tokens (millions) and runs per task by tier, rounds included (workflow analysis, 17 Oct 2026):
    # T0 one run, no verifier (lead reads the diff); measured 2.5M on FIX-50.
    # T1 12M builder + 4M lean verifier + 30% chance of a 5M patch round.
    # T2 20M builder (measured median 18.4M) + 12M full verifier + 50% chance of a 12M fix round.
    "tier_tokens_m": {"T0": 3.0, "T1": 17.5, "T2": 38.0},
    "tier_runs": {"T0": 1.0, "T1": 2.3, "T2": 2.5},
    "tier_hours": {"T0": 0.2, "T1": 0.9, "T2": 1.5},   # agent-hours per task
    "size_mult": {"S": 0.6, "M": 1.0, "L": 1.8},        # ASSUMED: the tier figures are for a typical (M) task
    "bundle_discount": 0.8,      # a bundled task pays 80%: the fixed start (rules, worktree, installs) is paid once
    "merge_every": 6,            # one merge run per batch of this many checked tasks
    "merge_tokens_m": 15.0,      # one merge run: stack, stamps, contract, the full app check once per batch
    "found_work": 0.20,          # new fix tasks found on the way (measured ~20%)
    "lead_overhead": 0.18,       # the lead's share of spend (measured 18%)
    "usd_per_m_tokens": 0.214,   # API-equivalent $ per million agent tokens ($3.31 per 15.5M-token run, 16 Oct)
    "range": {"light": 0.7, "expected": 1.0, "heavy": 1.4},  # spread of $ per run (3.9 / 5.5 / 7.8)
    "plan_week_usd": 2300,       # API-priced work one Max 20x plan carries per week (measured 10 to 13 Oct)
    "plan_month_price_usd": 200, # price of one plan per month; check before quoting
    "fx_local_per_usd": 1400,    # local currency per dollar, with card charges (NGN in the WAWU build)
    "local_currency": "NGN",
    "fleet_cap": 8,              # agents at once
    "burn_m_tokens_per_hour_full_fleet": 140,  # measured at 8 agents, 16 to 17 Oct
    "duty": 0.6,                 # share of the clock the fleet runs full (taps, merges, restarts, nights)
    "margin": 0.25,              # added to full-tilt hours
    "link_overhead_hours": 1.0,  # per task on a dependency chain: CI on push, hand-back, merge
    "active_hours_per_day": 16,  # hours a day a dependency chain moves
}


def load(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def col(r, k, default=""):
    return (r.get(k) or default).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", required=True)
    ap.add_argument("--params")
    ap.add_argument("--plans", type=int, default=1)
    ap.add_argument("--deadline-days", type=float)
    ap.add_argument("--out")
    a = ap.parse_args()

    P = json.loads(json.dumps(DEFAULTS))
    if a.params:
        P.update(json.load(open(a.params)))

    rows = load(a.tasks)
    tasks = [r for r in rows if col(r, "kind") != "owner"]
    owner = [r for r in rows if col(r, "kind") == "owner"]
    by_id = {r["id"]: r for r in rows}
    problems = []

    bundle_size = defaultdict(int)
    for r in tasks:
        if col(r, "bundle"):
            bundle_size[col(r, "bundle")] += 1
    for b, n in bundle_size.items():
        if n > 5:
            problems.append(f"bundle {b} has {n} tasks (2 to 5)")
        tiers = {col(r, "tier", "T1") for r in tasks if col(r, "bundle") == b}
        if "T0" in tiers and len(tiers) > 1:
            problems.append(f"bundle {b} mixes T0 with {sorted(tiers - {'T0'})}: T0 work stays in T0 runs")

    tok, hrs, runs = {}, {}, {}
    for r in tasks:
        s, t = col(r, "size"), col(r, "tier", "T1")
        if s not in P["size_mult"]:
            problems.append(f"{r['id']}: size '{s}' is not S, M or L")
            continue
        if t not in P["tier_tokens_m"]:
            problems.append(f"{r['id']}: tier '{t}' is not T0, T1 or T2")
            continue
        m = P["size_mult"][s] * (P["bundle_discount"] if bundle_size.get(col(r, "bundle"), 0) >= 2 else 1.0)
        tok[r["id"]] = P["tier_tokens_m"][t] * m
        hrs[r["id"]] = P["tier_hours"][t] * P["size_mult"][s]
        runs[r["id"]] = P["tier_runs"][t]
    for r in rows:
        for d in filter(None, (x.strip() for x in col(r, "depends_on").split(";"))):
            if d not in by_id:
                problems.append(f"{r['id']}: depends on unknown task '{d}'")

    # bundles share one builder and one verifier, so count runs per bundle once
    seen_b = set()
    run_count = 0.0
    for r in tasks:
        if r["id"] not in runs:
            continue
        b = col(r, "bundle")
        if b and bundle_size[b] >= 2:
            if b in seen_b:
                continue
            seen_b.add(b)
        run_count += runs[r["id"]]

    task_m = sum(tok.values())
    merges = math.ceil(len(tok) / P["merge_every"]) if tok else 0
    merge_m = merges * P["merge_tokens_m"]
    found_m = P["found_work"] * (task_m + merge_m)
    agent_m = task_m + merge_m + found_m
    agent_usd = agent_m * P["usd_per_m_tokens"]
    lead_usd = P["lead_overhead"] / (1 - P["lead_overhead"]) * agent_usd
    total_usd = agent_usd + lead_usd
    agent_hours = sum(hrs.values()) * (1 + P["found_work"])

    # critical path: the longest dependency chain in calendar days (task hours plus CI and merge per link,
    # at the hours a day a chain moves) plus the owner waits on it
    memo = {}

    def chain(i, seen=()):
        if i in memo:
            return memo[i]
        if i in seen:
            problems.append(f"dependency cycle through {i}")
            return (0.0, [i])
        r = by_id[i]
        best = (0.0, [])
        for d in (x.strip() for x in col(r, "depends_on").split(";")):
            if d in by_id:
                c = chain(d, seen + (i,))
                if c[0] > best[0]:
                    best = c
        if col(r, "kind") == "owner":
            own = float(col(r, "wait_days") or 0)
        else:
            own = (hrs.get(i, 0.0) + P["link_overhead_hours"]) / P["active_hours_per_day"]
        memo[i] = (best[0] + own, best[1] + [i])
        return memo[i]

    cp = max((chain(i) for i in by_id), key=lambda c: c[0], default=(0.0, []))
    cp_days = cp[0]
    cp_wait = sum(float(col(by_id[i], "wait_days") or 0) for i in cp[1] if col(by_id[i], "kind") == "owner")

    by_area = defaultdict(lambda: {"tasks": 0, "usd": 0.0})
    by_size, by_tier = defaultdict(int), defaultdict(int)
    for r in tasks:
        if r["id"] not in tok:
            continue
        ar = by_area[col(r, "area", "Other")]
        ar["tasks"] += 1
        ar["usd"] += tok[r["id"]] * P["usd_per_m_tokens"] * (1 + P["found_work"]) / (1 - P["lead_overhead"])
        by_size[col(r, "size")] += 1
        by_tier[col(r, "tier", "T1")] += 1

    fleet = P["burn_m_tokens_per_hour_full_fleet"] * P["fleet_cap"] / 8

    def scenario(k):
        f = P["range"][k]
        usd = total_usd * f
        plan_weeks = usd / P["plan_week_usd"]
        thr_days = agent_m * f / fleet * (1 + P["margin"]) / (24 * P["duty"])
        # a plan's weekly allowance can be spent as fast as the fleet burns it; then the fleet waits for the reset
        per_plan = plan_weeks / max(a.plans, 1)
        if per_plan <= 1:
            cap_days = 0.0
        else:
            full = math.ceil(per_plan) - 1
            cap_days = full * 7 + thr_days * (per_plan - full) / per_plan
        days = max(cap_days, thr_days, cp_days)
        binding = "plan capacity" if days == cap_days else "fleet throughput" if days == thr_days else "critical path"
        months = max(1, math.ceil(days / 30))
        sub_usd = a.plans * P["plan_month_price_usd"] * months
        out = {
            "api_usd": round(usd),
            "plan_weeks": round(plan_weeks, 2),
            "dynamic_days": round(days, 1),
            "binding": binding,
            "days_by_limit": {"plan capacity": round(cap_days, 1), "fleet throughput": round(thr_days, 1), "critical path": round(cp_days, 1)},
            "subscription_usd": sub_usd,
            "subscription_local": round(sub_usd * P["fx_local_per_usd"]),
            "payg_local": round(usd * P["fx_local_per_usd"], -3),
        }
        if a.deadline_days:
            need = max(1, math.ceil(plan_weeks / math.ceil(a.deadline_days / 7)))  # plan-weeks that start by the date
            m2 = max(1, math.ceil(a.deadline_days / 30))
            out["fixed"] = {
                "deadline_days": a.deadline_days,
                "plans_needed": need,
                "subscription_usd": need * P["plan_month_price_usd"] * m2,
                "subscription_local": round(need * P["plan_month_price_usd"] * m2 * P["fx_local_per_usd"]),
                "feasible": cp_days <= a.deadline_days and thr_days <= a.deadline_days,
                "why_not": [n for n, d in (("critical path", cp_days), ("fleet throughput", thr_days)) if d > a.deadline_days],
            }
        return out

    data = {
        "params": P,
        "plans": a.plans,
        "counts": {"tasks": len(tok), "bundles": sum(1 for n in bundle_size.values() if n >= 2), "runs": round(run_count),
                   "merge_runs": merges, "owner_items": len(owner), "by_size": dict(by_size), "by_tier": dict(by_tier)},
        "tokens_m": {"tasks": round(task_m), "merges": round(merge_m), "found_work": round(found_m), "agents_total": round(agent_m)},
        "usd": {"agents": round(agent_usd), "lead": round(lead_usd), "total": round(total_usd)},
        "agent_hours": round(agent_hours),
        "critical_path": {"days": round(cp_days, 1), "owner_wait_days": cp_wait, "chain": cp[1]},
        "by_area": {k: {"tasks": v["tasks"], "usd": round(v["usd"])} for k, v in sorted(by_area.items(), key=lambda x: -x[1]["usd"])},
        "scenarios": {k: scenario(k) for k in P["range"]},
        "owner_items": [{"id": r["id"], "title": r.get("title"), "wait_days": float(col(r, "wait_days") or 0)} for r in owner],
        "problems": problems,
    }
    if a.out:
        with open(a.out, "w") as f:
            json.dump(data, f, indent=1, ensure_ascii=False)
    e = data["scenarios"]["expected"]
    c = data["counts"]
    print(f"tasks {c['tasks']} in {c['bundles']} bundles + singles; {c['runs']} runs + {merges} merge runs; owner items {c['owner_items']}")
    print(f"  by tier {c['by_tier']}, by size {c['by_size']}")
    print(f"API-equivalent ${data['usd']['total']:,} expected (light ${data['scenarios']['light']['api_usd']:,}, heavy ${data['scenarios']['heavy']['api_usd']:,}); {agent_m:,.0f}M agent tokens")
    print(f"plan-weeks {e['plan_weeks']} on {a.plans} plan(s): about {e['dynamic_days']} days, bound by {e['binding']} {e['days_by_limit']}")
    print(f"critical path {data['critical_path']['days']} days (owner waits {cp_wait:g}): {' > '.join(cp[1][-8:])}")
    if a.deadline_days:
        fx = e["fixed"]
        print(f"by day {a.deadline_days:g}: {fx['plans_needed']} plan(s), feasible {fx['feasible']} {fx['why_not'] or ''}")
    if problems:
        print("PROBLEMS:", *problems, sep="\n  ", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
