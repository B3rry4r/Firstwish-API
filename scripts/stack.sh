#!/usr/bin/env bash
# A local API stack for one agent or one person: PostgreSQL + Redis (shared, started if down), a fresh database
# <prefix>_test copied from the migrated template, and the API on <port> with stand-in providers.
#   scripts/stack.sh up <prefix> <port>    prints BASE_URL and PIDs, and writes them to $STACKS_DIR/<prefix>.env
#   scripts/stack.sh down <prefix>         stops the API by PID and drops <prefix>_test
# Two stacks with different prefixes and ports never collide: own database, own port, own Redis key prefix.
# PG_ADMIN_URL: a role that can create databases (default postgresql://firstwish:firstwish@127.0.0.1:5432/postgres).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${STACKS_DIR:-}" ]]; then
  if [[ -d /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad ]]; then
    STACKS_DIR=/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/stacks
  else
    STACKS_DIR="${TMPDIR:-/tmp}/firstwish-stacks"
  fi
fi
PG_ADMIN_URL="${PG_ADMIN_URL:-postgresql://firstwish:firstwish@127.0.0.1:5432/postgres}"
export PG_ADMIN_URL
REDIS_PORT="${REDIS_PORT:-6379}"

die() { echo "stack: $*" >&2; exit 1; }

ensure_postgres() {
  if psql "$PG_ADMIN_URL" -qtAc "SELECT 1" >/dev/null 2>&1; then return; fi
  command -v pg_lsclusters >/dev/null || die "PostgreSQL is not reachable at PG_ADMIN_URL and there is no local cluster to start"
  local line ver name
  line="$(pg_lsclusters --no-header | awk '$1 ~ /^16/ {print; exit}')"
  [[ -n "$line" ]] || die "no local PostgreSQL 16 cluster"
  ver="$(awk '{print $1}' <<<"$line")"; name="$(awk '{print $2}' <<<"$line")"
  if ! grep -q online <<<"$line"; then pg_ctlcluster "$ver" "$name" start; fi
  # a local role for the stacks and the test runner; local only, so its password is not a secret
  local user pass
  user="$(node -e 'const u=new URL(process.argv[1]);console.log(decodeURIComponent(u.username))' "$PG_ADMIN_URL")"
  pass="$(node -e 'const u=new URL(process.argv[1]);console.log(decodeURIComponent(u.password))' "$PG_ADMIN_URL")"
  [[ "$user" =~ ^[a-z_][a-z0-9_]*$ ]] || die "bad role name in PG_ADMIN_URL"
  for _ in $(seq 1 30); do su postgres -c "psql -qtAc 'SELECT 1'" >/dev/null 2>&1 && break; sleep 0.5; done
  if [[ "$(su postgres -c "psql -qtAc \"SELECT 1 FROM pg_roles WHERE rolname='$user'\"")" != "1" ]]; then
    su postgres -c "psql -qc \"CREATE ROLE $user LOGIN CREATEDB PASSWORD '${pass//\'/}'\"" >/dev/null
  fi
  psql "$PG_ADMIN_URL" -qtAc "SELECT 1" >/dev/null || die "cannot connect with PG_ADMIN_URL after starting PostgreSQL"
}

ensure_redis() {
  if redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then return; fi
  command -v redis-server >/dev/null || die "Redis is not reachable on port $REDIS_PORT and redis-server is not installed"
  redis-server --daemonize yes --port "$REDIS_PORT" --bind 127.0.0.1 --save "" --appendonly no >/dev/null
  for _ in $(seq 1 20); do redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1 && return; sleep 0.25; done
  die "Redis did not start"
}

secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'; }

up() {
  local prefix="${1:-}" port="${2:-}"
  [[ "$prefix" =~ ^[a-z][a-z0-9]*$ ]] || die "usage: stack.sh up <prefix> <port> (prefix: lowercase letters and digits)"
  [[ "$port" =~ ^[0-9]+$ ]] || die "usage: stack.sh up <prefix> <port>"
  mkdir -p "$STACKS_DIR"
  local envfile="$STACKS_DIR/$prefix.env" log="$STACKS_DIR/$prefix.log"
  if [[ -f "$envfile" ]]; then
    local old; old="$(grep '^API_PID=' "$envfile" | cut -d= -f2 || true)"
    if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null; then die "stack $prefix is already up (PID $old); run down first"; fi
  fi
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then die "port $port is in use"; fi

  ensure_postgres
  ensure_redis
  local db="${prefix}_test" url
  url="$(node "$ROOT/scripts/db.mjs" create "$db" "$prefix")"
  if [[ -z "${STACK_SKIP_BUILD:-}" ]]; then (cd "$ROOT" && npm run -s build) || die "build failed"; fi

  local base="http://127.0.0.1:$port"
  (
    cd "$ROOT"
    env NODE_ENV=development PROVIDERS=standin PORT="$port" \
      DATABASE_URL="$url" REDIS_URL="redis://127.0.0.1:$REDIS_PORT" \
      JWT_ACCESS_SECRET="$(secret)" REFRESH_TOKEN_PEPPER="$(secret)" AUTH_CODE_PEPPER="$(secret)" \
      COOKIE_DOMAIN=127.0.0.1 WEB_ORIGINS="${STACK_WEB_ORIGINS:-http://localhost:3000}" \
      PUBLIC_SITE_URL="${STACK_WEB_ORIGINS:-http://localhost:3000}" API_PUBLIC_URL="$base" \
      MAIL_FROM=wishes@example.test \
      nohup node dist/main.js >"$log" 2>&1 &
    echo $! >"$STACKS_DIR/$prefix.pid"
  )
  local pid; pid="$(cat "$STACKS_DIR/$prefix.pid")"; rm -f "$STACKS_DIR/$prefix.pid"
  local ok=""
  for _ in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then tail -n 20 "$log" >&2; die "the API exited; log: $log"; fi
    if [[ "$(curl -s -o /dev/null -w '%{http_code}' "$base/v1/health")" == "200" ]]; then ok=1; break; fi
    sleep 0.5
  done
  [[ -n "$ok" ]] || { kill "$pid" 2>/dev/null || true; die "the API did not answer /v1/health on $base; log: $log"; }

  cat >"$envfile" <<ENV
PREFIX=$prefix
BASE_URL=$base/v1
API_PID=$pid
PORT=$port
DB_NAME=$db
DATABASE_URL=$url
REDIS_URL=redis://127.0.0.1:$REDIS_PORT
LOG=$log
ENV
  cat "$envfile"
}

down() {
  local prefix="${1:-}"
  [[ "$prefix" =~ ^[a-z][a-z0-9]*$ ]] || die "usage: stack.sh down <prefix>"
  local envfile="$STACKS_DIR/$prefix.env"
  [[ -f "$envfile" ]] || die "no stack $prefix ($envfile not found)"
  local pid db
  pid="$(grep '^API_PID=' "$envfile" | cut -d= -f2)"
  db="$(grep '^DB_NAME=' "$envfile" | cut -d= -f2)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
  fi
  node "$ROOT/scripts/db.mjs" drop "$db"
  rm -f "$envfile"
  echo "stack $prefix down (PID $pid stopped, database $db dropped)"
}

case "${1:-}" in
  up) shift; up "$@" ;;
  down) shift; down "$@" ;;
  *) die "usage: stack.sh up <prefix> <port> | down <prefix>" ;;
esac
