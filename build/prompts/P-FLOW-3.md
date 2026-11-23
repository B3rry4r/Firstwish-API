BUILDER P-FLOW-3 | TIER T0 (the live test harness only: no screen, no server code) | Budget 60 steps. The server now refuses a style that is not made for a wish's kind or is above its ticket; the harness makes wishes that break that rule. Change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; stop only PIDs you started; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md and rulings IJ2, IJ4 in /home/user/Firstwish-API/build/rulings-phase3.md (a wish's style must be on, offered
for the wish's kind and allowed by its ticket; a kind change with a style held is re-checked; the server picks a
fitting style itself when none is sent; `allowedStyles` on the wish read lists exactly what a save accepts).
Work: a new local branch `p-flow-3` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-3 (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-3-api at the API commit in
your spawn line (it HOLDS the server's fifteenth round). Ports 5700-5719; stack prefix pf3; the stack BUILT.
You own: scripts/live/flows/** and scripts/live/*.mjs (the harness), nothing under app/, components/ or lib/.
 1. scripts/live/flows/w7-api.mjs makeDraft makes a love wish in the first starter style (banter, made for
    celebration and group): pf1.mjs A2 and A4 fail from it. Every helper and flow that makes a wish or sets a
    style through the API (grep the harness for wish makes, `style`, `styleSlug`, kind changes, ticket starts and
    direct SQL that writes a wish's style) picks a style from the wish's own `allowedStyles` (or lets the server
    pick), for the kind and ticket it uses. Direct SQL that puts a style on a wish must write what the server
    would accept too.
 2. Run the WHOLE driver on a fresh stack against this API: every FAIL caused by the server's new rule (422
    style_wrong_kind, style_above_ticket, the kind-change refusal, a wish with styleSlug "") is yours to fix in
    the harness the same way; a FAIL that shows a SCREEN is wrong under the new rule (it offers or sends what the
    server refuses): do NOT paper over it: list it with the screen's file and line.
 3. w11.mjs, w12.mjs and w13.mjs cannot run twice on one stack (w11's last-owner check meets staff rows left by
    earlier runs; w12 deletes an invoice that still has an invoice_link row; w13 "allowing the photo wrote the
    screening result"): each cleans up what it made and tolerates rows left by an earlier run of itself. Prove:
    each alone TWICE on one stack: 0 FAIL both times.
Proof: the whole driver ONCE more on a fresh stack: 0 FAIL (give it over 4500 s); `node --check` on each changed
file; typecheck; gates. Commit; do not push; stack down, databases and worktrees removed. Hand back ONCE in 10
lines: head; the places changed for item 1 (file:line list); screens found wrong (item 2); item 3's totals; the
driver's totals.
