# Rules every agent follows (40 lines or fewer, read in full by every run; dated incidents go to LESSONS.md, no brief names it)
Fill every {{PLACEHOLDER}} once and name this file first in every brief.
## Machine
- {{MACHINE_LINE: e.g. "4 CPUs, 15 GB, 38 GB free"}}. At most {{HEAVY_CAP}} heavy agents (servers, suites, builds, exports). Start a heavy
  job only when `free -g` shows 5 GB available, else look again within 4 minutes. `df -h {{WT_ROOT}} /tmp` before a build or pictures.
- "Memory cgroup out of memory", a jest SIGKILL or a server dying silently is a memory kill, not a code failure: wait, run again.
- Repos: {{REPO_LIST: name, path, origin}}. `git fetch -q origin '+refs/heads/*:refs/remotes/origin/*'`. Never change a shared clone's
  branch: `git -C <repo> worktree add --detach {{WT_ROOT}}/<name> <ref>`, removed at the end with your big outputs.
- Dependencies: `cp -al <source>/node_modules <worktree>/node_modules` (a changed lockfile: clean install in your worktree).
- Database {{DB_HOST_USER}}: only names that start with your prefix and contain `test`; drop them at the end. Only your ports. Build
  caches per agent (`TMPDIR=<your scratch>/tmp`); after a web export grep the bundle for `localhost:`: only your ports.
## Checks and spend (cost is steps times context)
- Run only the affected tests, typecheck and lint on changed files. Never the full suite; never wait on or poll CI. {{BRANCH_PATTERN}}
  pushes run it and the lead reads the run.
- Quiet output: `(cmd; echo "EXIT $?") > $S/logs/x.log 2>&1; tail -n 15 $S/logs/x.log`. Gate on that EXIT line. On failure
  `grep -n -m 20 -E "FAIL|Error"`. Never cat a log or a whole diff (`git diff --stat`); read files by line range.
- Never idle over 4 minutes (the cache lapses at 5): `timeout 230 bash -c 'until grep -q "^EXIT" log; do sleep 20; done'`.
- Your brief gives the step budget and the hand-back length. At the budget: push, hand back what remains.
## Stack
Only `{{STACK_SCRIPT}}` (`up --name <prefix> --ports <range> --scratch {{SCRATCH}}/stacks`, `status`, `down` with the same name and
scratch). Never hand-build a server, stand-in or web build. `down` before hand-back.
## Never
- Call a real payment, identity, email or AI provider, a production host or a customer's account ({{FORBIDDEN_HOSTS}}); use stand-ins.
- `pkill`, `killall`, `pgrep -f` (kill your own PIDs); `git stash`, `reset --hard`, `checkout -- .`, `clean`, rebase, amend, force-push.
- Edit a gate, a test you did not write or a baseline to pass. A real new route or rate limit is declared in the inventory spec, with a reason.
- Put a credential, full ID or full phone number in a commit, report or file name. Address the owner. Write an em-dash a user reads.
## Pushing and hand-back
- Push only your named branch, with retries (5, 10, 20, 40, 60 s); confirm with `git ls-remote origin refs/heads/<branch>`; push at
  each milestone (a restart once wiped every worktree; remote branches survived). Trailers: {{TRAILERS}}. Hand back right after the push.
- Stop every process you started, by PID (`ss -ltnp` on your ports shows none of yours); removing a worktree does not stop one.
## Owner rules you will meet
{{STANDING_OWNER_RULES: one line each, dated}}
- No questions to the owner: pick the default the design, rulings or safest behaviour give, write "Default (lead), owner may override"
  in the task's Current state, go on.
