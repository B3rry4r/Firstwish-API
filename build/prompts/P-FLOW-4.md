PATCH P-FLOW-4 | TIER T1 (the live harness; a possible server regression) | Budget 90 steps. Two flows fail on the head; find out why; fix the flow or name the product fault. Nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started);
never touch scripts/gates/** or the baseline file; final runs in the FOREGROUND; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and line 10 of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w16/VERDICT.md.
Work: a new local branch `p-flow-4` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-4 (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-4-api at the API commit in
your spawn line; FIRST `API_DIR=<it> npm run contracts:check` (exit 0). Ports 5780-5799; stack prefix pf4; BUILT.
You own: scripts/live/flows/w7*.mjs, scripts/live/flows/wa6a.mjs, scripts/live/drive.mjs (one line: wire scripts/live/flows/w16.mjs in, it
is not in the driver yet). NO file under app, components, lib or styles: a product fault is REPORTED, not fixed here.
The facts: the lead's whole driver was 2,152 of 2,152 on web b3f1844 with the server's rounds 9 to 16. On web 3c9089b
with API 7c41b46 a verifier saw, on the base: w7 3 FAIL (the countdown's opens-time / network check; "resting" 200
where 410 is expected; the countdown "20 s ready") and wa6a 1 FAIL ("resting ... 200"), and wa6a stopping early (52
PASS then a "flow ran to the end" timeout). Since b3f1844 the server took round 17 (which styles a wish may take),
P-CI-6 (the support hand-over), P-CI-7/8 (tests only) and round 19; the web took W15C-S1 (previews from the server),
P-W14D, WEB-10A (the maker's secret) and W16 (a new draft takes the server's pick of style; makeDraft no longer names one).
Do:
 1. Reproduce each failure on the head, alone on a fresh stack, twice. For each: the request, the answer, what the
    flow expected and why (the ruling or the contract line it rests on).
 2. Find the commit that changed it (run the flow against the older web or API commit named above: one worktree at
    a time). Say for each: the FLOW is wrong (its assumption is out of date: fix the flow, loosen nothing: the check
    still proves the rule) or the PRODUCT is wrong (a resting wish answering 200 where the rulings say 410 would be a
    real regression: name the file:line and the ruling; do not fix it; leave the check failing and say so).
 3. Wire w16.mjs into drive.mjs; run w7, wa6a, w16 and the flows that share their helpers twice: say the totals.
Checks: `node --check` on each file; `npx tsc --noEmit`; `npm run gates` (0 new). Commit on p-flow-4; do not push; stop
your stacks by PID; remove your worktrees. Hand back ONCE in 10 lines: head; each failure: cause, commit, flow or
product; what you changed; totals; what was NOT run.
