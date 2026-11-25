PATCH R4C round 1 (ruling IK8a) | TIER T2 (the render page for every style; edits style files) | Budget 80 steps. Close the named findings. Nothing else.
ONE heavy job at a time, only when `free -g` shows 5 GB or more; no command over 8 minutes (long flows in the background with a log, waiting in loops of
230 s or less; sweep in parts); NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started); never touch scripts/gates/** or
the baseline; never edit, build, checkout or reset anything in /home/user/Firstwish-web or /home/user/Firstwish-API themselves; no `rm -rf` in a loop.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Quiet logs in $S/build/logs/pr4c-*.log ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md; /home/user/Firstwish-API/build/prompts/R4C.md (the contract); the verdict
/home/user/Firstwish-API/build/handover/verdicts/r4c-VERDICT.md and its frames in r4c-pics/; rulings IK8, IK8a (END of build/rulings-phase3.md);
components/engine/controls.tsx (Press, Anchor, Field, Hint, Hush, useRender).
Work: the local web branch `r4c` (head 847b3fd = the old a770810) in your own worktree $S/build/wt/pr4c (`git worktree add <path> r4c`); FIRST
`git merge --no-edit ccr-91b3ed11-fx445c` there (brings the new stepped clock; no conflict expected), `npm ci`. API worktree $S/build/wt/pr4c-api
at API ccr-91b3ed11-fx445c (`npm ci`, `npx prisma generate`); `API_DIR=<it> npm run contracts:check` exit 0. Stack by scripts/live/stack.mjs (name
pr4c, ports 5420-5439, TEST_DB_PREFIX=pr4c), BUILT. Under the render page only: OUTSIDE a render a control keeps its element, role, name, handler, words.
Findings (a picture of each BEFORE, at 1080 x 1920, from the head; then AFTER):
 H1 "Touch the star": stage/tinsel/endings/candle.tsx:238; stage/constellation/endings/candle.tsx:166 and its Opening.tsx:400.
 H2 the composer (field bar and send arrow) drawn in every group-chat recording: stories/group-chat/Scene.tsx:614-624.
 M3 an empty white pill where text was: group-chat envelope ending (and the small pill in its letter scene).
 M4 the lullaby candle ending's pull cord still hangs at the left edge (the tag is hidden, the cord is not).
 M5 "Hold to light the runway" in swipe or stage boarding-pass endings/candle.tsx:363: show it absent in frames or hide it.
 L6 (IK8a makes these must-fix) pips and counters only a phone holder needs: polaroid-table "04 / 04", the mixtape player pill, midnight "I / II",
    mosaic "02 / 07", status and pidgin-gist story bars.
 W  the sweep's word list (scripts/live/flows/r4-words.mjs) also catches touch, brush, rub, light the, press, pull, drag, swipe, scratch, blow,
    shake, tilt, scroll, type, say, speak (and every Hint or Hush string, as now); prove "Touch the star" on the head is caught.
Then LOOK: every style you edited, 5 moments each at 1080 x 1920 (opening, two middle, ending start, last frame) into $S/build/pr4c-out/pics; say what
each shows. Run the sweep's first ending for all 43 styles plus every ending of the styles you edited (200 ms step): done and clean.
Receivers: for each file you edit, /w/<slug> at 360 and 1440, base against branch with ONE seed: the same controls (role, name), the cue's words still shown.
Checks: `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint` (863 warnings or fewer), `npm run check:css`, `npm run build`.
Commit on r4c (trailers in common-rules); do not push; stop your stack by PID; remove both worktrees (keep pr4c-out). Hand back ONCE in 12 lines: head;
each finding with before and after picture paths; the sweep's totals; the receiver compare; what was NOT run.
