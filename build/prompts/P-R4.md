PATCH P-R4 | TIER T2, round 1 | Budget 80 steps. Close the named findings of the verdict; change nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; NEVER commit tsconfig.json; never pkill, killall or pgrep -f
(stop only PIDs you started); never touch scripts/gates/** or the baseline file; never edit, build, checkout or reset anything in
/home/user/Firstwish-web or /home/user/Firstwish-API themselves; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, /home/user/Firstwish-API/build/prompts/R4.md and R4B.md, the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4/VERDICT.md
(items 1, 3, 4, 5, 6, 7 with file:line) and rulings IK6, IK6a, IK7a (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Work: the local branch `r4` of /home/user/Firstwish-web (head 80a83e2) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-r4 (`npm ci`); API
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-r4-api at the API commit in your spawn line (it has STANDIN_RENDER_HOLD_FILE: a render holds only
while that file exists); ports 5660-5679; stack prefix pr4; BUILT. You own the files R4 and R4B owned, plus, for the
`render` flag only, the style and ending components that draw a control (the verdict names five; find the rest).
 H1 (harness, high): stack.mjs set STANDIN_VIDEO=hold on every stack, so w10b's video stayed "being made" for 120 s
    and the flow failed. stack.mjs passes STANDIN_VIDEO=hold AND STANDIN_RENDER_HOLD_FILE=.live/stacks/<prefix>.render.hold
    (no file there at start); r4.mjs creates that file just before its asks and removes it after (also when it
    fails: try/finally); every other flow's video is made at once. Prove: w10b, w10c, pf1, pw3, w3, w17 and r4 on ONE
    stack, in the driver's order: all pass, and say how long each took.
 M3, M4, M5 (no controls, IK6): under the render page NOTHING a person could press or that names an action is
    drawn at any moment from ready to done: the ending's buttons and hints ("Blow out the candle", the tap hint,
    "Or blow into the microphone": components/moments/ending/candle/Scene.tsx:119-125), the footer link ("This was
    a wish. Make one.": ScrollScene.tsx:351, made/Scene.tsx:192), the film's scrub bar and time (film/reel/Scene.tsx:440,
    :397), and the same in EVERY other style and ending (list each you found). One mechanism: the player gives a
    `render` flag (a prop or the engine's context from Host) that each of those reads to draw the moment with its
    control left out and its question shown unanswered; not a growing list of CSS selectors in render.css. The
    receiver's view at /w/<slug> is unchanged (prove: pixels on three styles before and after).
    A check in r4.mjs for every style and ending kind you can reach: from ready to done, zero focusable elements,
    zero elements with role button or link, and none of the known action words on screen.
 M7 (for the recorder): on a scroll style `sceneName` flips to "ending" about 1.7 s before the ending is on show:
    the scene told is the scene on show (flip when the ending fills the screen), and `done` 1.5 s (stepped) after that.
 M6 (for the recorder, IK6a): the page reports each scene's start so a recorder can cut whole scenes from the
    middle: `window.__render.scenes` = the list so far of {name, at (stepped ms from ready)}; the read's `seconds`
    is now 60 for a status video: the page does not cut anything itself.
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint`
(863 warnings or fewer), `npm run check:css`, `npm run build`, contracts:check; r4.mjs twice: 0 FAIL; the flows named
in H1; w7, wa6a, wa7c, w10a once: 0 FAIL. Commit on r4; do not push; stop your stacks by PID; remove both worktrees.
Hand back ONCE in 10 lines: head; each finding before and after; every component that got the flag; the flows'
times; what was NOT run.
