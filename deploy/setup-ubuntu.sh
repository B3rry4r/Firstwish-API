#!/usr/bin/env bash
# Firstwish server packages check for Ubuntu 22.04 or 24.04. Run as root: sudo bash deploy/setup-ubuntu.sh
# Idempotent. It installs apt packages only (nothing else on the machine is changed) and prints what is still missing.
set -u
missing=0
say() { printf '%s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then say "Run as root (sudo) to install packages. Checking only."; CAN=0; else CAN=1; fi

PKGS="ffmpeg fonts-liberation fonts-noto-color-emoji fontconfig ca-certificates curl"
if [ "$CAN" = 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq || say "apt-get update failed"
  for p in $PKGS; do
    dpkg -s "$p" >/dev/null 2>&1 || apt-get install -y -qq "$p" || say "could not install $p"
  done
  # Chromium: Ubuntu's chromium package is a snap and does not suit a service. Install Google Chrome or the Playwright build
  # yourself (see docs/DEPLOY.md) and set RENDER_CHROMIUM_PATH. This script does not do that.
fi

check() { # name, command
  if command -v "$2" >/dev/null 2>&1; then say "ok       $1: $(command -v "$2")"; else say "MISSING  $1"; missing=$((missing+1)); fi
}
check "node (version 22)" node
check ffmpeg ffmpeg
check ffprobe ffprobe
check "fc-list (fonts)" fc-list

if command -v node >/dev/null 2>&1; then
  case "$(node -v)" in v22.*) say "ok       node version $(node -v)";; *) say "MISSING  node 22 (found $(node -v))"; missing=$((missing+1));; esac
fi
for f in "${RENDER_CHROMIUM_PATH:-/usr/bin/google-chrome}"; do
  if [ -x "$f" ]; then say "ok       chromium: $f"; else say "MISSING  chromium at $f (set RENDER_CHROMIUM_PATH to the real path)"; missing=$((missing+1)); fi
done
for p in fonts-liberation fonts-noto-color-emoji; do
  dpkg -s "$p" >/dev/null 2>&1 && say "ok       $p" || { say "MISSING  $p"; missing=$((missing+1)); }
done
mem_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo); swap_kb=$(awk '/SwapTotal/{print $2}' /proc/meminfo)
[ "$mem_kb" -ge 3800000 ] && say "ok       memory $((mem_kb/1024)) MB" || { say "MISSING  memory: $((mem_kb/1024)) MB, the render worker wants 4 GB"; missing=$((missing+1)); }
[ "$swap_kb" -gt 0 ] && say "ok       swap $((swap_kb/1024)) MB" || { say "MISSING  swap (add 2 GB; see docs/DEPLOY.md)"; missing=$((missing+1)); }

say "missing: $missing"
exit 0
