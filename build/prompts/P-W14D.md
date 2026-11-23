BUILDER P-W14D | TIER T1 (staff lists; no money, no identity) | Budget 50 steps. Two things a checker saw on the staff lists in a whole run; find each cause and fix it; change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started);
never touch scripts/gates/** or the baseline file; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and the last ten lines of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w15c-s1/VERDICT.md
(the W14B lines).
Work: a new local branch `p-w14d` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w14d (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w14d-api at the API commit in your
spawn line. Ports 5500-5519; stack prefix pw14d; BUILT.
You own: the staff Businesses list component and its styles (find it under components/admin/), components/admin/d/
Support.tsx and c/Concierge.tsx (item 2 only), scripts/live/flows/w14b.mjs.
 1. /admin/businesses with a 300-character unbroken search word scrolls sideways at 360 (scrollWidth 3077) when
    w14b.mjs runs ALONE on a stack other flows have used (it passed inside a fresh whole run). Find when it
    happens (which text carries the long word: the no-match line, an error line, a chip, the field itself;
    with businesses present or not) and make the screen hold at 360, 390 and 1440 in every one of those states;
    then check the other six staff lists in the same states (rows present, none, the server's 422 words).
 2. In a whole run w14b.mjs failed three checks at the staff Support list: sort, then Back, then reload (the sort
    and page kept in the address) and passed them alone. Run w14b.mjs after w14.mjs and w11.mjs on one stack, as
    the driver orders them, until it fails; say whether the SCREEN loses the sort or page (a real fault: fix it)
    or the flow reads too early or meets rows other flows left (fix the flow: wait on the state, look rows up by
    name). No expectation loosened.
Proof: w14b.mjs alone on a fresh stack and again after w11.mjs and w14.mjs on the same stack: 0 FAIL each, twice;
the measures of item 1; typecheck, lint on changed files, check:css, gates, test:client, build exit 0. Commit; do
not push; stack down, databases and worktrees removed. Hand back ONCE in 6 lines: head; the cause of each with
file:line; what changed; the flows' totals.
