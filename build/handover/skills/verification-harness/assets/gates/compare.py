#!/usr/bin/env python3
"""Gates on a repo that already fails: fail only on FAIL keys the base lacks.

    python3 scripts/gates/compare.py [--base origin/main]

Runs `run.py --json` in a detached worktree of the base ref and in this tree, then
compares the FAIL keys (a key has no line number, so moved code is not new). Exit 0:
nothing new, prints "same N FAIL as <base>". Exit 1: new FAIL lines. Exit 2: could not
compare, including when either side scanned zero files (globs that match nothing). `run.py --accept` is for first adoption by the lead or owner, never for this.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def fail_keys(cwd: Path) -> dict:
    p = subprocess.run([sys.executable, "scripts/gates/run.py", "--json"],
                       cwd=cwd, capture_output=True, text=True)
    try:
        data = json.loads(p.stdout)
        keys = {f["key"]: f for f in data["failures"]}
    except (ValueError, KeyError):
        print(f"compare: no gate JSON from {cwd} (exit {p.returncode}): {p.stderr[-300:]}")
        sys.exit(2)
    # Zero files scanned means nothing was examined: "same 0 FAIL" would be a lie.
    # A run.py older than this one has no count; only a count of 0 is refused.
    if data.get("files_scanned") == 0 or data.get("inconclusive"):
        print(f"compare: INCONCLUSIVE, no files matched files.source in {cwd}. "
              "Nothing was examined, so nothing can be compared. Fix the globs.")
        sys.exit(2)
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="origin/main")
    base = ap.parse_args().base
    tmp = Path(tempfile.mkdtemp(prefix="gates-base-")) / "wt"
    if subprocess.run(["git", "worktree", "add", "--detach", str(tmp), base]).returncode:
        return 2
    try:
        old, new = fail_keys(tmp), fail_keys(Path.cwd())
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(tmp)])
    added = [f for k, f in new.items() if k not in old]
    for f in added:
        print(f"NEW FAIL  {f['gate']}  {f['path']}:{f['line']}  {f['message']}"[:200])
    if added:
        print(f"{len(added)} new FAIL not on {base} ({len(old)} already there)")
        return 1
    print(f"same {len(new)} FAIL as {base}" if len(new) == len(old)
          else f"{len(new)} FAIL, fewer than the {len(old)} on {base}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
