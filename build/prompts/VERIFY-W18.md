VERIFIER W18 | TIER T1, lean (a recording script and one static address) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; never pkill, killall or pgrep -f (stop only PIDs you started); never
edit, build, checkout or reset anything in /home/user/Firstwish-web or /home/user/Firstwish-API themselves; no single command over 8 minutes; no `rm -rf` inside a
loop or a long chained command (remove your own folders with one plain command at the end; if your session refuses a command, do not retry and
ask nobody: say NOT RUN). Notes to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w18/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/W18.md (its cases are the contract); rulings IK6e, IK6f (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Under test: /home/user/Firstwish-web local branch `w18` (head 023e2ce) against its base 88bcd46. Two detached worktrees of your own:
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w18 (the branch) and .../build/wt/v-w18-base (the base), `npm ci` in each. Ports 5280-5299.
Chromium /opt/pw-browsers/chromium (Playwright is installed: install nothing); ffmpeg /usr/bin/ffmpeg.
The builder's claims: 1 an error thrown in a stepped setTimeout, setInterval or requestAnimationFrame reaches pageerror in its step, the rest of
the step still runs; 2 freeze({ epoch }) from the first script: virtual time 0, Date.now() exactly epoch, steps exact; two recordings with one
epoch: equal frames; a CSS animation first seen after the freeze is held from the start of its step (a change beyond the brief, only when frozen
from the start); a late freeze() with no argument behaves as before; 3 GET /render-clock.js: 200, JavaScript type, the text of CLOCK_SHIM exactly,
no cookie, max-age 300, nosniff, made by app/render-clock.js/route.ts (force-static) from scripts/lib/clock-shim.mjs (one source, no node half);
4 requestIdleCallback runs on a step; 16 checks pass in scripts/lib/stepped-clock.test.mjs. The builder did NOT run case 5 (the previews unchanged).
Check:
 1. Run its test file against the branch (16 pass) and against the BASE's clock (the cases it says fail there, fail).
 2. Case 5, which nobody ran: record TWO styles' previews (gele, a scroll; cap-toss, a film) with the base's script
    and with the branch's, into four fresh folders of your own (never public/previews): the same frame count and
    equal frames (decode and hash; if any differ: how many, where, and why). This is the main risk: say it plainly.
 3. The render page with the new clock: on the branch, `next build` + `next start`, and with a stand-in stack if
    you need a token (scripts/live/stack.mjs; else a plain probe page): a page with a CSS animation, a Web
    Animation, a transition started by a timer, and a requestAnimationFrame loop, frozen from the first script
    with an epoch, recorded twice: equal frames; and the "held from the start of its step" change: does an
    animation still END at the right virtual time (no drift over 300 steps)?
 4. /render-clock.js: the bytes equal the constant; a HEAD and a GET; it is static (no per-request code); nothing
    else new is served; the shim holds no secret, no absolute path, no node-only word.
 5. `node --check` on the scripts; `npx tsc --noEmit`; `npm run lint`; `npm run gates` (0 new); `git diff --stat
    88bcd46 023e2ce`: only the files the brief lets it own; nothing under public/previews, no tsconfig, no gate file.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w18/VERDICT.md (20 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line. Stop what you started by PID; remove both worktrees and your recordings (keep the numbers). Hand back ONCE in 10 lines.
