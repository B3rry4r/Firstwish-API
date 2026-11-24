#!/usr/bin/env bash
# wait_ci.sh <owner/repo> <sha-or-branch> [min_runs=1] [max_minutes=90]
# Waits with zero tokens until every check run on the commit has completed, then prints one line per run
# and a last line: "CI GREEN", "CI RED: <names>" or "CI TIMEOUT". Exit 0 green, 1 red, 2 timeout.
# Env: POLL=30 (seconds between looks). Needs an authenticated `gh`.
# Run it in the background and read only the last line of its log:
#   (wait_ci.sh org/repo $SHA 3 60 > $S/logs/ci.log 2>&1 &) ; later: tail -n 8 $S/logs/ci.log
set -u
repo=${1:?usage: wait_ci.sh <owner/repo> <sha> [min_runs] [max_minutes]}; sha=${2:?sha}
min=${3:-1}; max=${4:-90}; poll=${POLL:-30}
command -v gh >/dev/null || { echo "NO gh CLI"; exit 3; }
tries=$(( max * 60 / (poll > 0 ? poll : 1) )); out=""
for i in $(seq 1 "$tries"); do
  out=$(gh api "repos/$repo/commits/$sha/check-runs?per_page=100" \
        --jq '.check_runs[] | "\(.name) | \(.status) | \(.conclusion)"' 2>/dev/null)
  n=$(printf "%s\n" "$out" | grep -c '|')
  if [ "$n" -ge "$min" ] && ! printf "%s\n" "$out" | grep -qE '\| (queued|in_progress|waiting|pending|requested) \|'; then
    printf "%s\n" "$out"
    red=$(printf "%s\n" "$out" | grep -E '\| (failure|timed_out|cancelled|action_required|startup_failure) *$' \
          | cut -d'|' -f1 | sed 's/ *$//' | paste -sd, -)
    if [ -z "$red" ]; then echo "CI GREEN"; exit 0; fi
    echo "CI RED: $red"; exit 1
  fi
  sleep "$poll"
done
printf "%s\n" "$out"; echo "CI TIMEOUT (runs seen: ${n:-0}, wanted: $min)"; exit 2
