# Rules every agent follows (read in full by every run)
## Machine
- 4 CPUs, 15 GB, about 60 GB free disk (measured 25 Nov). At most 2 browser or stack jobs and 1 other heavy job at once. Start a heavy job only when `free -g` shows
  5 GB available, else look again within 4 minutes. `df -h /home/user /tmp` before a build or pictures; stop if under 5 GB free.
- "Killed", a jest SIGKILL or a server dying silently is a memory kill, not a code failure: wait, run again.
- Repos: web /home/user/Firstwish-web (origin B3rry4r/Firstwish-web), api /home/user/Firstwish-API (origin B3rry4r/Firstwish-API). Work
  branches are named in your brief. Never change a shared clone's branch: `git -C <repo> worktree add --detach /tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad/build/wt/<name> <ref>`,
  removed at the end with your big outputs.
- Dependencies: `cp -al <repo>/node_modules <worktree>/node_modules` (a changed lockfile: clean install in your worktree).
- Database: local PostgreSQL 16; only databases whose names start with your prefix and contain `test`; drop them at the end. Only your ports.
## Checks and spend (cost is steps times context)
- Run only the affected tests, typecheck and lint on changed files. Never the full suite; never wait on or poll CI.
- Quiet output: `(cmd; echo "EXIT $?") > /tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad/build/logs/x.log 2>&1; tail -n 15 /tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad/build/logs/x.log`. Gate on that EXIT line. On failure
  `grep -n -m 20 -E "FAIL|Error"`. Never cat a log or a whole diff (`git diff --stat`); read files by line range.
- Never idle over 4 minutes. Your brief gives the step budget and the hand-back length. At the budget: push, hand back what remains.
## Never
- Call a real payment, message, email, storage or AI provider, or the live site (firstwish-web.vercel.app, firstwish.moxnafrica.com); use stand-ins.
- `pkill`, `killall`, `pgrep -f` (kill your own PIDs); `git stash`, `reset --hard`, `checkout -- .`, `clean`, rebase, amend, force-push.
- Edit a gate, a test you did not write or a baseline to pass. Deploy, or open a pull request.
- Put a credential, full phone number or the owner's email in a commit, report or file name. Write an em-dash a user reads.
## Web app facts (Firstwish-web)
- Next.js 16 app router, React 19, TypeScript. `npm run build` runs `node scripts/check-css.mjs` first: a rule in styles/site.css must not
  START from a class styles/cinema.css owns. Every stylesheet is loaded app-wide after client-side moves, so every class carries its area's
  prefix (fa- app, ff- feed, fm- maker, fs- studio, fp- business dashboard, fv- vault, fl- you, fe- engine, fwpv- previews, mk- made, bk- bank,
  fo- admin, st-<slug>- styles, mo-<slug>- moments). Never a bare short class, never a bare element rule (a bare `section{}` once padded the app).
- Your own dev server: `NEXT_DIST=.next-<prefix> npx next dev -p <your port>` inside your worktree; stop it by PID.
- Screens are proved in a browser (Playwright: require('/opt/node-tools/node_modules/playwright'), chromium.launch()), narrowest first:
  360 x 740, then 390 x 844, then 1440 x 900; `documentElement.scrollWidth <= innerWidth`; zero console errors; light and dark.
## Committing and hand-back
- Commit as Claude <noreply@anthropic.com> on the local branch your brief names, in your own worktree. Trailers on every commit:
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>   (agents; the lead uses its own model line)
  Claude-Session: https://claude.ai/code/session_01VNvA3zNK8bJENArUhDXHfa
- Do NOT push: this session may push only one branch, and the lead does it after merging yours. Commit at each milestone, hand back
  with the head sha. Stop every process you started, by PID.
## Owner rules you will meet (build/rulings.md in the API repo has the exact words)
- Plain short words. Say "kind" for kinds of wish. Never "forever", "launch", "coming soon", "abroad", "diaspora" in customer copy. No emojis.
- No native browser controls (select, date input, alert, confirm): the app's own. No dead controls. Portrait and Landscape, never "sideways".
- Nothing faked: where a server will answer one day, an API-seam file that says what it will ask and returns marked sample data. AI is never faked.
- Copper accent #c8693a (var(--accent)). Never "done" before it works against the real backend: say "screen built". Nothing is stored in the browser (no localStorage, sessionStorage, IndexedDB: R10). Firstwish sends email only; draw nothing about SMS or WhatsApp sending (R11).
- No questions to the owner: pick the default the design, rulings or safest behaviour give, write "Default (lead), owner may override", go on.
