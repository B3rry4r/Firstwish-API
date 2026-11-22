BUILDER P-FLOW-1 | TIER T1 (maker and You screens, live flows; no money moves) | Budget 70 steps. Two live checks fail on the head in every whole run, and three small states are owed; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed item; stop only PIDs you
started; run final suites in the FOREGROUND and hand back once, with nothing left running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks) and the rows UA-544 and UA-545 in
/home/user/Firstwish-API/.pipeline/ui-align-tasks.json (read only; do not edit that file).
Work: a new local branch `p-flow-1` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-flow-1 (`npm ci`); API worktree .../build/wt/p-flow-1-api detached at the API commit in
your spawn line; `API_DIR=<it> npm run contracts:check` exits 0. Ports 5700-5719; stack prefix pf1; the stack BUILT.
You own: scripts/live/flows/p-w5.mjs, w5-maker2.mjs, web-api-4.mjs (the one wait in item 3 only),
components/app/maker/StylePick.tsx, app/app/you/page.tsx, scripts/live/flows/pf1.mjs (new; joins the driver).
NOT yours: components/app/Switcher.tsx, components/app/studio/**, components/admin/**, components/app/pro/**.
 1. w5-maker2.mjs:278 "the styles on screen are ones the server has on for this kind" (tiles=0, server on=23) and
    p-w5.mjs:246-248 "L1 an empty moment list says so in words" (reads "Getting the scenes…"): both read the
    screen before the levels read ends (since the screen began to wait for the server's levels). FIRST prove that
    is the whole cause: on a fresh stack, by hand, the style tiles DO appear and the empty words ARE said once
    loading ends; if the screen itself is wrong (no tiles ever, or loading never ends), that is a screen bug: fix
    the screen and say so. Then each flow waits for the state it reads (never a fixed time). Each alone: 0 FAIL,
    three runs in a row.
 2. components/app/maker/StylePick.tsx:91-98: Continue is active while the levels are loading or failed to load.
    It is not active until a style that may be used is chosen; a failed read says so with a way to try again (the
    screen's designed error words). Check in pf1.mjs with the levels read held and failed (route interception).
 3. web-api-4.mjs "moderation draws the held photo" failed under load (src empty) and passes alone: wait for the
    picture's address to be set, not a fixed time.
 4. UA-544, UA-545: the You screen's designed loading and error states are drawn and can be entered (the account
    read held; the read failed: the designed words and a way to try again); checks in pf1.mjs; measure both at
    360, 390 and 1440, light and dark; one light/dark picture pair each.
Then the whole driver ONCE on a fresh stack: 0 FAIL except `W10 the editor has no picture upload control` only if
it shows (another branch owns it); any other FAIL: rerun that flow alone and report both.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check,
build. Commit; do not push; do not edit .pipeline-ui/wired.json, scripts/gates/** or a baseline; remove YOUR
worktrees, stack and databases. Hand back ONCE in 10 lines: head; items 1-4 with file:line and the proof (item 1:
the cause you proved); the flows' totals and the driver's; `git diff --stat`.
