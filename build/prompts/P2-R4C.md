PATCH R4C round 2 (the LAST round; rulings IK8a, IK8b) | TIER T2 (the render page for every style) | Budget 90 steps. Close the named items. Nothing else.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Same rules as /home/user/Firstwish-API/build/prompts/P-R4C.md lines 2 to 5 (read them; heavy-job, no-pkill, gates, tsconfig, no-edit-of-main-clones rules).
Read /home/user/Firstwish-API/build/common-rules.md; P-R4C.md (the round-1 brief); rulings IK8, IK8a, IK8b (END of build/rulings-phase3.md); round 1's
pictures in $S/build/pr4c-out (pics/, before/, receivers.md); components/engine/controls.tsx (Press, Anchor, Field, Hint, Hush, Pips, useRender).
Work: the local web branch `r4c` (head 8b445d7) in your own worktree $S/build/wt/p2r4c (`git worktree add <path> r4c`, `npm ci`); API worktree
$S/build/wt/p2r4c-api at API ccr-91b3ed11-fx445c (`npm ci`, `npx prisma generate`); contracts:check exit 0. Stack by scripts/live/stack.mjs (name p2r4c,
ports 5460-5479, TEST_DB_PREFIX=p2r4c), BUILT. Under the render page only: outside a render nothing changes for a receiver.
Items (a picture BEFORE from 8b445d7 and AFTER, 1080 x 1920, into $S/build/p2r4c-out):
 M3 group-chat envelope ending: the letter plate draws empty in the last frame and a small white pill stays in the letter scene: under the render page
    the plate shows its words as if pulled (IK8b); no empty shape anywhere.
 C1 boarding-pass "STEP ... 1 OF 3" (swipe/boarding-pass/pages.tsx:243): not drawn under the render page.
 C2 the fireworks ending title "Light the sky, X." (components/moments/ending/fireworks/Scene.tsx:57): under the render page the finished line, never the ask.
 S  The WHOLE sweep with the new word list: every ending of all 43 styles (in parts, 200 ms step): every case done and clean; any new cue found is
    fixed the same way (a Hint, Hush or Pips wrapper, or the done state) and listed. Then LOOK at 5 frames of every case you change.
Receivers: each file you edit, /w/<slug> at 360 and 1440, base against branch, one seed: the same controls and cue words.
Checks: `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint` (863 warnings or fewer), `npm run check:css`, `npm run build`.
Commit on r4c; do not push; stop your stack by PID; remove your worktrees (keep p2r4c-out). Hand back ONCE in 12 lines: head; M3, C1, C2 with picture
paths; the whole sweep's totals (cases, clean, which not); new cues found; receiver compare; what was NOT run.
