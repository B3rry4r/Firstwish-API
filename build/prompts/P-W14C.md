BUILDER P-W14C | TIER T1 (staff screens; no money moves, no identity change) | Budget 50 steps. Small faults the check of the staff follow-ups found; change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; stop only PIDs you started; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and the verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w14b/VERDICT.md.
Work: a new local branch `p-w14c` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w14c (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w14c-api at the API commit in your
spawn line. Ports 5500-5519; stack prefix pw14c; BUILT. You own: components/admin/b/Styles.tsx (item 1 only),
components/admin/d/{Support,Thread}.tsx, components/admin/c/Concierge.tsx, lib/admin/w14-api.ts,
scripts/live/flows/w14b.mjs.
 1. MEDIUM components/admin/b/Styles.tsx:87: a 300-character unbroken search word makes /admin/styles scroll
    sideways (scrollWidth 3961 at 360): the no-match line wraps, as W14B did on Wishes, Support and Concierge.
    Then grep EVERY staff screen that echoes a typed word and prove none scrolls sideways with that word (list).
 2. Support.tsx:42 and Concierge.tsx:47: the placeholders are cut at 360 (347 and 354 px in a 240 px field): a
    shorter placeholder from the same words, whole at 360.
 3. Support.tsx:30 and Concierge.tsx:37: the search word, the filter chips and the page are lost on Back from a
    thread or an order: keep them in the address (the query string), not in the browser's storage (R10): Back,
    Forward and a reload give the same list.
 4. Concierge.tsx:106: a FAILED read of the order's wishes says "No wish is tied to this order yet.": a failure
    says so in the designed error words with a way to try again; the empty words only for a real empty answer.
 5. lib/admin/w14-api.ts searchWord: the server gets at most 100 characters: the field takes at most 100 (the
    count is the server's limit: say where it is read from) and the screen echoes what was sent.
Checks in w14b.mjs for each; w14b.mjs and w14.mjs alone: 0 FAIL; measure the six staff screens at 360, 390, 1440,
light and dark with the long word; typecheck, lint on changed files, check:css, gates, test:client,
contracts:check, build exit 0. Commit; do not push; stack down, databases and worktrees removed. Hand back ONCE
in 8 lines: head; items 1-5 with file:line and the proof; the flows' totals.
