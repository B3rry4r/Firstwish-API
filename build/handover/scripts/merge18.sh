#!/bin/bash
cd "$1"
L="$2"
( npm ci >/dev/null 2>&1; echo "npm EXIT $?"
  npx prisma generate >/dev/null 2>&1; echo "prisma EXIT $?"
  WEB_REPO=/home/user/Firstwish-web node scripts/export-seed-data.mjs >/dev/null 2>&1; echo "seed EXIT $?"
  npx tsc --noEmit -p tsconfig.json >$L-tsc.log 2>&1; echo "tsc EXIT $?"
  npm run lint >$L-lint.log 2>&1; echo "lint EXIT $?"
  bash scripts/gates.sh >$L-gates.log 2>&1; echo "gates EXIT $?"
  node scripts/check-contracts.mjs >$L-contracts.log 2>&1; echo "contracts EXIT $?"
  node scripts/check-drift.mjs >$L-drift.log 2>&1; echo "drift EXIT $?"
  node scripts/check-routes.mjs >$L-routes.log 2>&1; echo "routes EXIT $?"
  TEST_DB_PREFIX=lead18 npm test -- --maxWorkers=2 >$L-test.log 2>&1; echo "test EXIT $?"
  git status --porcelain | head -5
  echo DONE ) > $L.log 2>&1
