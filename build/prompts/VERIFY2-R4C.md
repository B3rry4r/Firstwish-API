VERIFIER R4C after its two fix rounds (rulings IK8, IK8a, IK8b) | TIER T2 (the render page for every style; 39 files) | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, only when `free -g` shows 5 GB or more (another job runs here); no command over 8 minutes (long flows in the background with a log,
waiting in loops of 230 s or less); never pkill, killall or pgrep -f (stop only PIDs you started); never edit, build, checkout or reset anything in
/home/user/Firstwish-web or /home/user/Firstwish-API themselves; no `rm -rf` in a loop. S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Notes to $S/build/verify/r4c2/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md; build/prompts/R4C.md, P-R4C.md, P2-R4C.md (the contract and both rounds); build/handover/verdicts/r4c-VERDICT.md;
rulings IK8, IK8a, IK8b (END of build/rulings-phase3.md); the builder's sheets in $S/build/p2r4c-out (sheetA.jpg, sheetB.jpg, after/, before/) and $S/build/pr4c-out.
Under test: local web branch `r4c` head ebc5c30 (it already merged web 2f45b9d) in your own detached worktree $S/build/wt/v2-r4c (`npm ci`); a base
worktree $S/build/wt/v2-r4c-base at 2f45b9d; API worktree $S/build/wt/v2-r4c-api at API ccr-91b3ed11-fx445c (`npm ci`, `npx prisma generate`);
contracts:check exit 0. Stacks by scripts/live/stack.mjs (names v2r4c and v2r4cb, ports 5540-5579, TEST_DB_PREFIX=v2r4c), BUILT.
The builders' claims: 95 of 95 cases (43 styles x every ending + 10 ending scenes) done and clean at 200 ms; under the render page no touch cue,
composer, cord, empty plate, "1 of 3" or other counter, fireworks ask; a counter-by-shape rule in the sweep; receivers unchanged (round 2 did NOT run it).
Attack (a control, a cue, a counter or an empty shape in a recorded frame, or a receiver who lost a cue or a working control, is HIGH):
 1. RECEIVERS (nobody ran it for round 2): for EVERY style file changed in `git diff --name-only 2f45b9d ebc5c30 -- components`, /w/<slug> at 360 and
    1440, base stack against branch stack, ONE seed for both: the controls (role, name, box), the cue words and their place at the same moments, and
    each control still works when pressed (state after the press). Fireworks: a receiver still taps three times (the scene does not play itself).
 2. LOOK: render page at 1080 x 1920, 5 moments each, for every changed style and 8 unchanged ones you pick: a cue, an arrow, a button shape, a
    counter, a pip, an empty gap. Open every picture yourself. List each thin progress line still drawn (style, where) as its own finding.
 3. The sweep on the branch (first ending of all 43 + every ending of the changed styles, 200 ms): done and clean; 0 page errors.
 4. Checks: `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint` (863 or fewer), `npm run check:css`, `npm run build`;
    no tsconfig, scripts/gates/**, .pipeline-ui/wired.json or public/previews file in the diff.
Write $S/build/verify/r4c2/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line and picture paths, claims
confirmed or refuted, NOT run. Stop your stacks by PID; remove your worktrees (keep the pictures you cite). Hand back ONCE in 20 lines.
