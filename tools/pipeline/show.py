#!/usr/bin/env python3
"""Compact views of the frozen registry (never print registry.json whole).

  python3 tools/pipeline/show.py index            one line per resource: name, fields, endpoints, declarations
  python3 tools/pipeline/show.py <Resource>       that resource's fields, endpoints and sources, compactly
  python3 tools/pipeline/show.py endpoint E-12    one endpoint in full
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REG = json.loads((ROOT / ".pipeline/registry.json").read_text())


def index() -> None:
    for r in REG["resources"]:
        decl = ",".join(r["sourceDeclarations"]) or "-"
        emb = ",".join(f"{e['field']}<{e['from']}" for e in r["embedded"]) or "-"
        print(f"{r['name']:<28} f={len(r['fields']):<3} e={len(r['endpoints']):<3} scr={len(r['sourceScreens']):<3} decl={decl} emb={emb}")


def resource(name: str) -> None:
    hit = [r for r in REG["resources"] if r["name"].lower() == name.lower()]
    if not hit:
        sys.exit(f"no resource {name}")
    r = hit[0]
    print(f"# {r['name']}  screens={len(r['sourceScreens'])} decl={r['sourceDeclarations']} embedded={r['embedded']}")
    for f in r["fields"]:
        sup = f" sup={'; '.join(f['supersedes'])[:120]}" if f["supersedes"] else ""
        tb = f" typeBy={f['typeBy']}" if "typeBy" in f else ""
        n = "?" if f["nullable"] else ""
        print(f"  {f['name']}{n}: {f['type']} [{','.join(f['classes'])}]{tb}{sup}")
    for e in r["endpoints"]:
        auth = ";".join(a.get("role") or ",".join(a.get("roles", [])) or a.get("scope", "") or a["kind"] for a in e["auth"])
        resp = e["response"] or {}
        print(f"  {e['id']} {e['method']} {e['path']}  auth={auth}  -> {resp.get('entity')}/{resp.get('cardinality')}")
        for b in e["body"]:
            print(f"      body {b['name']}: {b['type']}")
        if resp.get("note"):
            print(f"      note: {resp['note'][:200]}")
        for n_ in e["notes"]:
            print(f"      ~ {n_[:160]}")


def endpoint(eid: str) -> None:
    for r in REG["resources"]:
        for e in r["endpoints"]:
            if e["id"] == eid:
                print(r["name"])
                print(json.dumps(e, indent=1))
                return
    sys.exit(f"no endpoint {eid}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "index":
        index()
    elif a[0] == "endpoint":
        endpoint(a[1])
    else:
        resource(a[0])
