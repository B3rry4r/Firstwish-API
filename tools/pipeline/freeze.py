#!/usr/bin/env python3
"""Freezes the registry (standard library only).

Sets .pipeline/registry.json frozenAt to UTC now (to the second) and writes .pipeline/registry.lock.json with
frozenAt, registrySha256 (of registry.json as written), resources, endpoints and the decision id of the freeze.
While the lock exists tools/pipeline/reconcile.py refuses to run unless called with --reopen "<ruling ids>".

Run: python3 tools/pipeline/freeze.py --decision DEC-136
Refuses (exit 2) when the decision is not in decisions.json or conflicts.json has open conflicts.
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PIPE = os.path.join(ROOT, ".pipeline")


def load(name):
    with open(os.path.join(PIPE, name), encoding="utf-8") as f:
        return json.load(f)


def main():
    if "--decision" not in sys.argv[1:-1]:
        print("usage: freeze.py --decision DEC-n (the decision that records this freeze)")
        return 2
    dec = sys.argv[sys.argv.index("--decision") + 1]
    if dec not in [d["id"] for d in load("decisions.json")["decisions"]]:
        print("REFUSED: %s is not in .pipeline/decisions.json" % dec)
        return 2
    open_n = load("conflicts.json").get("open", 0)
    if open_n:
        print("REFUSED: %d open conflicts in .pipeline/conflicts.json" % open_n)
        return 2
    registry = load("registry.json")
    now = datetime.now(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    registry["frozenAt"] = now
    text = json.dumps(registry, indent=2, ensure_ascii=False) + "\n"
    with open(os.path.join(PIPE, "registry.json"), "w", encoding="utf-8") as f:
        f.write(text)
    sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
    n_res = len(registry["resources"])
    n_ep = sum(len(r["endpoints"]) for r in registry["resources"])
    lock = {"frozenAt": now, "registrySha256": sha, "resources": n_res, "endpoints": n_ep, "decision": dec,
            "note": "Written by tools/pipeline/freeze.py. reconcile.py refuses to run while this file exists unless called with "
                    "--reopen \"<ruling ids>\"; after a reopen, freeze again with a new decision."}
    with open(os.path.join(PIPE, "registry.lock.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(lock, indent=1) + "\n")
    print("FROZEN %s: resources %d endpoints %d sha256 %s (%s)" % (now, n_res, n_ep, sha, dec))
    return 0


if __name__ == "__main__":
    sys.exit(main())
