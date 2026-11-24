#!/usr/bin/env bash
# wait_pr.sh <owner/repo> <pr-number-or-sha> <check-name-prefix> [max_minutes=90]
# Waits with zero tokens until the check run whose name starts with <check-name-prefix> (for example the
# protected-route suite) has completed on the PR head. Prints every run, then one last line:
# "PR CHECK <prefix>: <conclusion>" or "PR TIMEOUT". With a PR number it also prints the PR state first.
# Exit 0 when the conclusion is success, 1 otherwise, 2 on timeout. Env: POLL=60.
set -u
repo=${1:?usage: wait_pr.sh <owner/repo> <pr|sha> <check-prefix> [max_minutes]}; ref=${2:?pr or sha}
prefix=${3:?check name prefix}; max=${4:-90}; poll=${POLL:-60}
command -v gh >/dev/null || { echo "NO gh CLI"; exit 3; }
sha=$ref
case "$ref" in
  ''|*[!0-9]*) ;;
  *) info=$(gh api "repos/$repo/pulls/$ref" \
       --jq '"\(.head.sha) PR \(.number) state=\(.state) merged=\(.merged) mergeable_state=\(.mergeable_state)"' 2>/dev/null)
     [ -n "$info" ] || { echo "PR $ref not found"; exit 3; }
     sha=${info%% *}; echo "${info#* }" ;;
esac
tries=$(( max * 60 / (poll > 0 ? poll : 1) )); out=""
for i in $(seq 1 "$tries"); do
  out=$(gh api "repos/$repo/commits/$sha/check-runs?per_page=100" \
        --jq '.check_runs[] | "\(.name) | \(.status) | \(.conclusion)"' 2>/dev/null)
  line=$(printf "%s\n" "$out" | grep -F "$prefix" | grep -m1 '| completed |')
  if [ -n "$line" ]; then
    printf "%s\n" "$out"
    concl=$(printf "%s" "$line" | awk -F'|' '{gsub(/ /,"",$3); print $3}')
    echo "PR CHECK $prefix: $concl"; [ "$concl" = "success" ] && exit 0 || exit 1
  fi
  sleep "$poll"
done
printf "%s\n" "$out"; echo "PR TIMEOUT waiting for '$prefix' on ${sha:0:10}"; exit 2
