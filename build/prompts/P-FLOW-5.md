PATCH P-FLOW-5 | TIER T1 (one failing live check: a voice note after a reload) | Budget 70 steps. Find out why; fix the flow, or fix the product if the fault is small and in the files named; nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started);
never touch scripts/gates/** or the baseline file; final runs in the FOREGROUND; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and R10, R13 in /home/user/Firstwish-API/build/rulings.md.
Work: a new local branch `p-flow-5` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-5 (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-5-api at the API commit in
your spawn line; FIRST `API_DIR=<it> npm run contracts:check` (exit 0). Ports 5780-5799; stack prefix pf5; BUILT.
The fact: the flow scripts/live/flows/w5b*.mjs check "4a a voice note the maker saved plays after a reload, in the maker and in
/w/mine" FAILS on the head with `named=true maker=1 audio=true mine=plays media=0` (the lead's whole run, 23 Nov; and
two verifiers saw it on web 687a3a9). It PASSED in the lead's whole run on web b3f1844 (2,152 of 2,152). Between the
two the web took W15C-S1 (previews and samples read from the server: e7ffd0f) and P-W14D; later WEB-10A, W16.
Do:
 1. Reproduce alone on a fresh stack, twice; say what `media=0` counts (read the flow) and what a person would see
    and hear: does the saved voice note really play after a reload in the maker and at /w/mine (listen by the
    audio element's state: currentTime moving, a network read of the file, no error), or is only the flow's count off?
 2. Find the commit (run the flow on web b3f1844 and on e7ffd0f with the SAME API commit: one worktree at a time).
 3. If the PRODUCT is wrong (a person's saved voice note does not play, or is not read from the server after a
    reload): fix it where it broke, in the smallest change (you may edit the file that commit changed and
    components/app/maker/Voice.tsx; a shared component gets a prop, never a copy); nothing kept in the browser (R10).
    If the FLOW is wrong: fix the flow; loosen nothing: the check must still fail when the note does not play.
 4. Run w5b twice and the other maker flows (w4-maker1, w5-maker2, w6-maker3, w10a) once: 0 FAIL.
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint`
(warnings not above the head's), `npm run check:css`, `npm run build`. Commit on p-flow-5; do not push; stop your
stacks by PID; remove your worktrees. Hand back ONCE in 8 lines: head; what `media=0` meant; flow or product; the
commit; what you changed; totals; what was NOT run.
