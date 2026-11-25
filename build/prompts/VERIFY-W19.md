VERIFIER W19 (ruling IK6h (b)) | TIER T1 (the render page only) | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
Same rules as /home/user/Firstwish-API/build/prompts/VERIFY2-R4C.md lines 2 to 4 (read them; another stack job runs here). Notes to $S/build/verify/w19/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md; build/prompts/W19.md (the contract); rulings IK6f to IK6k (END of build/rulings-phase3.md).
Under test: local web branch `w19` head f0ded72 in your own detached worktree $S/build/wt/vw19 (`npm ci`); base worktree $S/build/wt/vw19-base at web
acd5550; API worktree $S/build/wt/vw19-api at API ccr-91b3ed11-fx445c (`npm ci`, `npx prisma generate`); contracts:check exit 0. Stacks by
scripts/live/stack.mjs (names vw19 and vw19b, ports 5700-5739, TEST_DB_PREFIX=vw19), BUILT.
The builder's claims: (1) a Studio wish says ready at virtual time 0 (RenderStage renders StudioHost directly; StudioHost's rig and dressing need no
timer); (2) four real-time starts fixed in clock-shim.mjs: step(0) runs no frame and conduct.ts calls __vt.frame() once; an animation first seen
before the first step starts at 0; IntersectionObserver told on each step; Math.random seeded by the epoch; (3) input JPEGs to ffmpeg 0 differing for
studio, owambe 540x960, polaroid-table, letter, reel; decoded frames still differ for owambe and polaroid because the API's openSegment encodes with
`-threads 2` (`-threads 1` gave identical files); (4) stepped-clock.test.mjs 24 of 24, cases 5a-5d fail on the head's shim; (5) receivers unchanged.
Attack (a receiver who changed, a Studio wish not ready, or a style whose frames differ for a cause other than the encoder, is HIGH):
 1. With the recorder itself (your own small node script in the API worktree calling ChromiumVideoRenderer as its spec does; 1080 x 1920, 8 s, one
    epochMs, the same wish twice): Studio, letter, owambe at 540 x 960, polaroid-table, and one stage style the builder did NOT try. Decoded frames
    (ffmpeg framemd5). Then in a SCRATCH copy of the recorder only (never commit, never in the API clone) set `-threads 1` and repeat: 0 differing?
    Do one pair while the other job loads the machine (say the load average).
 2. Receivers: /w/<slug> for a Studio wish and two house styles (one scroll style with `is-in`), base stack against branch stack, one seed, 360 (past
    the "Open it" gate to the ending) and 1440: same controls, same cue words, same moving parts; /render-clock.js is not loaded; Math.random is
    the browser's own; the Studio receiver still lazy-loads (Host.tsx unchanged).
 3. `node scripts/lib/stepped-clock.test.mjs` on branch and on base; `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint`
    (863 or fewer), `npm run build`; no tsconfig, scripts/gates/** or baseline file in the diff; nothing outside the owned files (W19.md) changed.
Write $S/build/verify/w19/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line, claims confirmed or refuted, NOT run.
Stop your stacks by PID; remove your worktrees and recordings. Hand back ONCE in 20 lines.
