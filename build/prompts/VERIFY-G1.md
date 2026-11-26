VERIFIER G1 | TIER T1 (one house style, gallery) | Budget 30 steps. You did not build this. Test, do not trust. You fix nothing.
Same rules as /home/user/Firstwish-API/build/prompts/VERIFY2-R4C.md lines 2 to 4 (read them; another stack job runs here). Notes to $S/build/verify/g1/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/G1.md (the contract).
Under test: web branch `g1` head 0ff0835 in your own detached worktree $S/build/wt/vg1 (`npm ci`); base worktree $S/build/wt/vg1-base at web 8ec7682;
API worktree $S/build/wt/vg1-api at API ccr-91b3ed11-fx445c (`npm ci`, `npx prisma generate`). Stacks by scripts/live/stack.mjs (names vg1 and vg1b,
ports 5740-5779, TEST_DB_PREFIX=vg1), BUILT. Seed a gallery wish with three DIFFERENT real photos uploaded through the maker (sizes made).
Claims: the photo Image had no crossOrigin (components/styles/stage/gallery/room.ts ~:93), so the canvas was tainted and texSubImage2D threw;
crossOrigin="anonymous" now, onerror falls back to the dark blank; the progress bar in Scene.tsx is in Pips (render page only).
 1. /w/<slug> at 360 (past the gate, every stop) and 1440, base against branch: page errors, and is each of the three photos drawn on its plane
    (a picture of each stop)? On base, are the photos missing for a receiver (say so: that is what a user saw)?
 2. Render page 1080 x 1920 with the three photos: done, clean, each photo drawn; r4.mjs gallery endings done and clean.
 3. A photo whose address fails (block it): the dark blank, no error loop, the walk goes on.
 4. `npx tsc --noEmit`, `npm run gates` (0 new), `npm run lint` (863 or fewer), `npm run build`; only gallery files in the diff.
Write $S/build/verify/g1/VERDICT.md (20 lines or fewer): MERGE or FIX FIRST, findings with file:line, NOT run. Stop your stacks by PID; remove your
worktrees. Hand back ONCE in 10 lines.
