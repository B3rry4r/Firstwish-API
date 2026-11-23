BUILDER P-FLOW-2 | TIER T0 (the live test harness only: no screen, no server code) | Budget 45 steps. Four harness faults that make whole runs fail for no product reason; change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; stop only PIDs you started; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (the stack). Work: a new local branch `p-flow-2` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8
(the head in your spawn line) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-2 (`npm ci`); API worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-2-api at the API commit in your spawn line. Ports 5700-5719; stack prefix pf2; the stack BUILT.
You own: scripts/live/stack.mjs, scripts/live/flows/wa6b.mjs, pw3.mjs, w5b.mjs, wa7.mjs (its header only).
 1. scripts/live/stack.mjs does not set STANDIN_SCREENING, so wa7.mjs's held and refused checks pass only when a
    person starts the stack with it by hand (a bare stack: about 10 FAIL). The stack script starts the API with
    STANDIN_SCREENING=hold:held,reject:refused,reject:bigpic:too-large unless the caller set one (stand-in
    providers only: it never sets it otherwise). Check no OTHER flow uploads a file whose name contains "held",
    "refused" or "bigpic" (grep; list). wa7's header says the stack sets it.
 2. wa6b.mjs:192 "the first business opens: its name" fails in whole runs and passes alone: it reads before the
    business has loaded. Wait for the state it reads (never a fixed time).
 3. pw3.mjs "after a reload the person still follows" depends on Home's capped who-list (it fails on a stack that
    holds many creators): find the creator it follows by name or through the screen's own way to see who is
    followed, not by position in the first few.
 4. w5b.mjs "peekOf waitFor" hits a 30 s limit under load: wait on the state with a limit that fits a loaded
    machine (the flow takes over 280 s alone: say its real time).
Proof: on a fresh stack started with NO STANDIN_SCREENING in your shell: wa7.mjs, wa6b.mjs, pw3.mjs, w5b.mjs alone:
0 FAIL each; then the whole driver ONCE: totals; any FAIL: rerun that flow alone and report both.
Checks: `node --check` on each file you changed; typecheck; gates. Commit; do not push; stack down, databases and
worktrees removed. Hand back ONCE in 8 lines: head; items 1-4 with file:line; the flows' totals and the driver's.
