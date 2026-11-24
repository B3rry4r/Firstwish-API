# The lead's records step after a web merge: drop baseline entries the gates no longer find, add screens to the wired list.
import json, subprocess, sys
g = json.loads(subprocess.run(["python3", "scripts/gates/run.py", "--json"], capture_output=True, text=True).stdout)
f = g["failures"]; nf = f if not isinstance(f, list) else len(f)
p = "scripts/gates/baseline.json"; raw = open(p).read(); b = json.loads(raw); nl = "\n" if raw.endswith("\n") else ""
assert json.dumps(b, indent=1, ensure_ascii=False) + nl == raw, "baseline does not round-trip"
found = {x["key"] for x in g["accepted"]}; stale = sorted(set(b["accepted"]) - found)
for k in stale: del b["accepted"][k]
open(p, "w").write(json.dumps(b, indent=1, ensure_ascii=False) + nl)
p = ".pipeline-ui/wired.json"; raw = open(p).read(); w = json.loads(raw); nl = "\n" if raw.endswith("\n") else ""
assert json.dumps(w, indent=2, ensure_ascii=False) + nl == raw, "wired does not round-trip"
ids = {x["id"] for x in json.load(open(".pipeline-ui/scan-map-screens.json"))["screens"]}
add = sys.argv[1:]; unknown = [a for a in add if a not in ids]
assert not unknown, f"unknown screen ids {unknown}"
for a in add:
    if a not in w["wired"]: w["wired"].append(a)
open(p, "w").write(json.dumps(w, indent=2, ensure_ascii=False) + nl)
print(f"failures {nf} | stale removed {len(stale)}: {' '.join(stale)} | baseline {len(b['accepted'])} | wired {len(w['wired'])}")
