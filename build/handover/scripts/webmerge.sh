#!/bin/bash
# usage: webmerge.sh <logprefix> <screen ids...>
S=/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad
L="$1"; shift
cd /home/user/Firstwish-web
( cp tsconfig.json $S/tsconfig.keep
  npm ci >/dev/null 2>&1; echo "npm EXIT $?"
  npx tsc --noEmit >$L-tsc.log 2>&1; echo "tsc EXIT $?"
  python3 $S/build/lead-records.py "$@" >$L-records.log 2>&1; echo "records EXIT $?"
  npm run gates >$L-gates.log 2>&1; echo "gates EXIT $?"
  python3 scripts/gates/check_baseline.py >$L-baseline.log 2>&1; echo "baseline EXIT $?"
  npm run test:client >$L-client.log 2>&1; echo "test:client EXIT $?"
  API_DIR=$S/build/wt/lead-int-7 npm run contracts:check >$L-contracts.log 2>&1; echo "contracts EXIT $?"
  npm run lint >$L-lint.log 2>&1; echo "lint EXIT $?"
  npm run check:css >$L-css.log 2>&1; echo "css EXIT $?"
  NEXT_DIST=.next-prod npm run build >$L-build.log 2>&1; echo "build EXIT $?"
  cp $S/tsconfig.keep tsconfig.json
  git status --porcelain | head -8
  echo DONE ) > $L.log 2>&1
