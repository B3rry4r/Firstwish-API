#!/bin/bash
cd /home/user/Firstwish-web
export API_DIR=/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/lead-drive-api LIVE_PREFIX=leadrun LIVE_API_PORT=5400 LIVE_WEB_PORT=5401
rm -f /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/lead-drive2.done /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/lead-drive2.log
npm run live:down >/dev/null 2>&1
npm run live:up -- --built > /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/lead-up2.log 2>&1 || { echo "UPFAIL" > /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/lead-drive2.done; exit 1; }
node scripts/live/drive.mjs --allow-not-wired > /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/lead-drive2.log 2>&1
echo "EXIT $?" > /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/lead-drive2.done
npm run live:down >/dev/null 2>&1
git checkout -- tsconfig.json 2>/dev/null
