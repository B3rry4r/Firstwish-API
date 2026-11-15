#!/usr/bin/env bash
# Build gates. Exit 0 when clean, 1 with each finding listed. Never edit this file to get a pass.
#  1. no float money: parseFloat, toFixed or toPrecision anywhere in src (money is integer kobo).
#  2. no deferral phrasing in src: unfinished work is not shipped with a note saying so.
#  3. no real provider host in tests: tests use stand-ins and local hosts only.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail=0
report() { # name, grep output
  if [[ -n "$2" ]]; then
    echo "GATE FAIL: $1"
    echo "$2" | head -n 50 | sed 's/^/  /'
    fail=1
  else
    echo "gate ok: $1"
  fi
}

src_ts() { find src -type f -name '*.ts' -not -name '*.spec.ts' -not -path '*/tests/*' 2>/dev/null; }
test_files() { find src test -type f \( -name '*.spec.ts' -o -path '*/tests/*' -o -path 'test/*' \) 2>/dev/null; }

files="$(src_ts)"
report "no float money (parseFloat/toFixed/toPrecision in src)" \
  "$( [[ -n "$files" ]] && grep -n -E '\b(parseFloat|toFixed|toPrecision)\b' $files )"

all_src="$(find src -type f -name '*.ts' 2>/dev/null)"
report "no deferral phrasing in src" \
  "$( [[ -n "$all_src" ]] && grep -n -i -E 'out of scope|this wave|belongs to|not readable here|later module|\bTODO\b' $all_src )"

tests="$(test_files)"
report "no real provider host in tests" \
  "$( [[ -n "$tests" ]] && grep -n -i -E 'paystack\.co|resend\.(com|dev)|anthropic\.com|cloudflarestorage\.com|r2\.dev|digitaloceanspaces\.com|amazonaws\.com|googleapis\.com|accounts\.google\.com|firstwish-web\.vercel\.app|firstwish\.moxnafrica\.com' $tests )"

exit $fail
