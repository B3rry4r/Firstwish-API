# Machine budget and hygiene on a shared box (D1 to D7, A9)

Many agents share one machine: the checkouts, the database server, the ports, the memory. Each rule below was paid for by
an incident in the WAWU build. They are cheap to follow and expensive to learn again.

## 0. Machine budget: measure, size the fleet, guard every brief
The box has a fixed number of CPUs, a memory limit and a disk. Agents that ignore them crash each other. Do this once at
the start, again after a restart or when the box changes.
1. Measure, and write the figures into `common-rules.md` as one machine line:
   ```
   nproc                          # CPUs
   free -g                        # the "available" column is what a new job can use
   df -h <work folder> <tmp>      # free disk where worktrees, builds and logs go
   cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/cpu.max 2>/dev/null   # in a container the cgroup limit is the real one
   ```
   Add any per-session disk allowance the host states. The smaller of host and cgroup figures wins. Example line:
   `Machine: 4 CPUs, 15 GB (13 available at start), 38 GB free on /home and /tmp, heavy-agent cap 5.`
2. Set the heavy-agent cap from the figures, not from habit. A heavy agent runs servers, test suites, builds or exports.
   The cap is `min(CPUs + 1, available GB / 2.5)`, rounded down, measured at the start. 4 CPUs and 15 GB give 5. In the
   WMT build 9 heavy agents on 4 CPUs and 15 GB caused out-of-memory kills, so start at the formula and drop the cap by
   one after any memory kill. Text-only agents (reading, writing, reviewing a diff) do not count. Queue the rest in `ALLOC.md`.
3. Every brief carries the machine line and the guard: start a heavy job only when `free -g` shows at least 5 GB
   available, otherwise wait and look again within 4 minutes (a loop inside one command, never one long sleep).
4. Disk. Check free space before a build, an export, or anything with video or pictures. An agent deletes its own large
   outputs and worktree when done; the lead does the rest in housekeeping (section 11). A full disk shows as "no
   space left on device"; deletes still work, so clear space first and rerun. On the WAWU box about 600 MB was left
   before 4.1 GB of video files and an orphan worktree were deleted.
5. A memory kill looks like: "Memory cgroup out of memory" in the kernel log, a jest worker "terminated by another
   process: signal=SIGKILL", or a server that dies with no error. It is not a code failure. Wait for memory, run again
   once, and never report it as a defect (section 6).
6. Move heavy suites to CI wherever the repo allows. CI has its own machines; every full suite it runs is one fewer on
   yours. It is the biggest relief available (law 9).

## 1. One detached worktree per agent (D1)
```
git -C <repo> fetch -q origin '+refs/heads/*:refs/remotes/origin/*'
git -C <repo> worktree add --detach $WT/<role>-<task>-<repo> origin/main      # or origin/<branch> to continue
...
git -C <repo> worktree remove --force $WT/<role>-<task>-<repo>               # at the end
git -C <repo> worktree prune
```
Never change the checked-out branch of the shared clones: an agent that does moves the ground under every other agent.
The agent commits and pushes its own branch; the lead merges by PR. Remove worktrees at the end, but a removed worktree
does not stop servers that ran from it (section 3).

## 2. Commands nobody runs, and the safe alternative
| never | why | instead |
|---|---|---|
| `git stash` | hides work in a shared repo | commit to your branch |
| `git reset --hard`, `git checkout -- .`, `git clean` | destroys uncommitted work, maybe another agent's | a new commit that reverts |
| rebase, amend, force-push | rewrites history others branched from | a merge commit, a new commit |
| `pkill`, `killall`, `pgrep -f` | match other agents' processes by name | kill by PID you recorded |
| editing a gate, a test you did not write, a baseline | the check then proves nothing | fix the code; the lead owns baseline rows |

## 3. Kill by PID, and leave nothing running (D2)
- Record the PID when you start a process: `node dist/main.js > log 2>&1 & echo $! > $S/pids/hub`. Kill the node PID, not a
  wrapper's: killing the wrapper leaves the child listening.
- Find what listens on your port: `ss -ltnp 'sport = :<port>'` (the pid is in the last column).
- Before hand-back: `ss -ltnp | grep -E ':(<your ports, joined with |>)\b'` prints nothing of yours. 17 orphans were found
  once after worktrees were removed; each held a port and memory.
- The lead checks after every wave: `ss -ltnp` for the whole port range, `git worktree list`, `psql -l` for database
  prefixes of finished tasks. Drop what belongs to a finished task; touch nothing else.

## 4. Ports, databases and stamps are assigned, not chosen (D4)
Keep one allocation file in the scratch folder; the lead edits it, every brief copies its row.
```
slot  task     branch      ports        db prefix   migration stamp
1     PAY-04   wmt/PAY-04  4100-4109    pay04       20261016010000
```
A block of 10 ports per slot is a convention; any scheme works if two live agents never share one. A database name starts
with the prefix and contains `test`, so an agent can never drop a real database by a typo. Two stacks must not share a name
or a checkout.

## 5. Per-agent caches (D3)
A shared bundler cache (the default temp folder) once baked another agent's API ports into a cached module, so a build
pointed at someone else's server and the pictures showed the wrong app. Give each agent its own: `TMPDIR=$S/tmp` or the
tool's cache flag. After a web export, grep the bundle for `localhost:` and confirm only your ports appear before you
open a picture. Same for browser profiles and remote-debugging ports: per agent, in the brief.

## 6. Memory and CPU (A9)
- Cap heavy agents (suites, servers, web builds, exports, browsers) with the formula in section 0. Text-only agents are free.
- Start a heavy job only when `free -g` shows 5 GB available; otherwise loop in one command, not one long sleep.
- Signature of a memory kill: a jest worker "terminated by another process: signal=SIGKILL", or a server gone with no
  error. It is not a code failure. Wait for memory, run again once, and do not report it as a defect.
- Under load, timing tests flake. Run the full check with two workers, in one command, and gate on its EXIT line:
  `(typecheck && lint && test --maxWorkers=2 && gates; echo "EXIT $?") > log 2>&1`.
- At most one server, one identity stand-in and one web build per agent at a time.

## 7. The stack script (A6)
Build once, early, before the first wave. Contract: `up --name N --ports A-B [--with x,y] --scratch DIR` boots the
server, its database (template copy), the stand-ins for every provider, optional web or mobile builds, and writes
`DIR/N/env.sh` for specs to source; `status` lists what runs; `down` stops by recorded PID and drops databases by name.
It refuses a name or a checkout already used in the same scratch folder, and a `quiet.sh N -- cmd` wrapper runs long
commands with the log-and-tail pattern. Agents never hand-build any of it.

## 8. Gate on the log's last line (D5)
A background job's exit code is the wrapper's, not the check's. Every check runs as
`(cmd; echo "EXIT $?") > log 2>&1`, and the gate before a push is `tail -n 1 log` equals `EXIT 0`. `EXIT 2` is a failure.
The lead applies the same rule to an agent's report: read the log's EXIT line, not "it passed" in prose.

## 9. Waiting costs nothing for the lead (D7)
The lead never polls with steps. It starts `assets/scripts/wait_ci.sh`, `wait_pr.sh` or `wait_deploy.sh` in the background
with output to a log, does other work, and reads the last line when the notification arrives. A subagent that must wait
(never for CI: it pushes and hands back) looks again within 4 minutes
(`timeout 230 bash -c 'until grep -q "^EXIT" log; do sleep 20; done'`); the prompt cache lapses at 5.

## 10. After a restart
A container restart wipes worktrees, databases and scratch files (it happened once). Branches on the remote survive.
Rules for that: agents push at milestones; a continuing brief says "start from the branch on origin"; the lead keeps the
allocation file and the briefs where they can be rebuilt (the task files live in a repo, not only in scratch); after a
restart the first job is to start the database server, recreate the shared dependency copy, and re-run the allocation.

## 11. Housekeeping: the orchestrator's job
Agents clean up after themselves (their worktree, their processes, their databases). Everything else is the lead's. A box
that is never swept fills up and starts killing agents.

Triggers (any one):
- after every merge;
- at least every few hours while agents run;
- at once when free disk is under about 20% or 5 GB, or available memory is under 5 GB.

Steps:
1. Look: `df -h <work> <tmp>`, `free -g`, a process list (`ps -eo pid,etime,rss,args --sort=-rss | head -n 25 | cut -c1-160`),
   `git worktree list`, `ss -ltnp` for the port range, `du -sh <scratch>/* | sort -h | tail`.
2. Remove the worktrees and scratch folders of merged or abandoned tasks: `git -C <repo> worktree remove --force <path>`,
   then `git -C <repo> worktree prune`. Match each folder against `ALLOC.md` and `status.json` first.
3. Delete large leftovers: build outputs, exported bundles, videos, pictures nobody cites, old logs, caches of finished tasks.
4. Stop orphan servers by PID, once no running agent owns them (check the port and the worktree path against `ALLOC.md`).
   Never `pkill`.
5. Log what was removed and the free disk before and after (`housekeeping.log` in the scratch folder), one line per sweep.

Limits:
- Never delete a folder a running agent uses, or evidence (pictures, logs, verifier files) that an open task still cites.
- While under the line (disk or memory), launch no new heavy agent. Sweep first, measure again, then dispatch.
- A task found obsolete mid-build (the owner changed the ruling, another task covered it) is stopped at once, its agent
  stopped by the lead, its worktrees and stack removed in the same sweep, and its slot freed in `ALLOC.md`.

WMT example: 108 finished-task folders and stale worktrees were cleared; free disk went from 3.9 GB to 9.5 GB with 12
agents running. The box had earlier been down to about 600 MB before 4.1 GB of video files and an orphan worktree were
deleted. Figures are examples; use the ones you measure.
