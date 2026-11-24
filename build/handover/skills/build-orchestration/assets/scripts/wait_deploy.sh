#!/usr/bin/env bash
# wait_deploy.sh <owner/repo> <sha> <workflow-name-regex> [url ...]
# Waits with zero tokens for the deploy workflow run on <sha> (name matched case-insensitively) to finish,
# prints its jobs, then does one read-only GET on each <url> (a health endpoint, a public page; never a
# write, never a payment) and prints the status codes. Last line: "DEPLOY OK", "DEPLOY FAILED: <why>" or
# "DEPLOY TIMEOUT". Exit 0 / 1 / 2. Env: POLL=60, MAX_MIN=60.
set -u
repo=${1:?usage: wait_deploy.sh <owner/repo> <sha> <workflow-regex> [url ...]}; sha=${2:?sha}; rx=${3:?workflow regex}
shift 3; poll=${POLL:-60}; max=${MAX_MIN:-60}
command -v gh >/dev/null || { echo "NO gh CLI"; exit 3; }
tries=$(( max * 60 / (poll > 0 ? poll : 1) )); r=""
for i in $(seq 1 "$tries"); do
  r=$(gh api "repos/$repo/actions/runs?head_sha=$sha" \
      --jq '.workflow_runs[] | "\(.id) \(.status) \(.conclusion) \(.name)"' 2>/dev/null | grep -iE "$rx" | head -1)
  case "$r" in
    *" completed "*)
      id=${r%% *}; concl=$(echo "$r" | awk '{print $3}'); echo "run $r"
      gh api "repos/$repo/actions/runs/$id/jobs" --jq '.jobs[] | "  \(.name): \(.conclusion)"' 2>/dev/null
      bad=""
      for u in "$@"; do
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$u"); echo "  GET $u -> $code"
        case "$code" in 2*) ;; *) bad="$bad $u($code)";; esac
      done
      if [ "$concl" != "success" ]; then echo "DEPLOY FAILED: run concluded $concl"; exit 1; fi
      if [ -n "$bad" ]; then echo "DEPLOY FAILED: not 2xx:$bad"; exit 1; fi
      echo "DEPLOY OK"; exit 0;;
  esac
  sleep "$poll"
done
echo "last seen: ${r:-no run for this sha}"; echo "DEPLOY TIMEOUT"; exit 2
