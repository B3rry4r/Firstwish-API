VERIFIER WEB-10D | TIER T1 (screens that show and take photos; 94 files, 79 with <img> replaced) | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Same rules as /home/user/Firstwish-API/build/prompts/VERIFY2-R4C.md lines 2 to 4 (read them; another stack job runs here). Notes to $S/build/verify/w10d/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/WEB-10D.md (the contract); rulings IM1, IM1a, IM2, IM3 and R10 (nothing stored in the browser).
Under test: web branch `web-10d` head d37b48a in your own detached worktree $S/build/wt/vw10d (`npm ci`); base worktree $S/build/wt/vw10d-base at web
dae0324; API worktree $S/build/wt/vw10d-api at API ccr-91b3ed11-fx445c (`npm ci`, `npx prisma generate`). Stacks by scripts/live/stack.mjs (names vw10d
and vw10db, ports 5780-5819, TEST_DB_PREFIX=vw10d), BUILT. The builder's pictures: $S/verify/web-10d/.
Claims: lib/pics.ts and components/SizedImg.tsx feed every drawn photo from `variants`; /w at 390 (2x, 3x) and 1440 (1x, 2x) fetched 3.85 to
3.99 MB instead of 13.1 MB, 0 full copies, 0 upscaled; sized:false shows the full copy with no layout shift; the render page uses w1600 and its
ready waits on decode(); pickers take jpeg, png, webp, gif (no HEIC); HEIC and 503 words show; Try again confirms again with no second upload;
the builder MOCKED the /w and render reads.
Attack (a broken or blurry photo, a full copy where a size exists, a picker that offers HEIC, a second upload, or a changed recorded frame, is HIGH):
 1. REAL server sizes: upload three 2400 px JPEGs through the maker on the real stack, wait for the sizes, then /w at 360, 390 (2x, 3x) and 1440:
    the bytes fetched (network log), which width each <img> asked for against its drawn box, upscaled or broken counts. Also the owner's wish and
    its preview, a list or cover, a friend's photo on a group wish, Studio, the Vault and staff Moderation: what each fetches (full copies are
    expected where the server sends no `variants`: list them).
 2. The render page at 1080 x 1920 with real sizes: w1600; one slowed photo: ready only after it decodes. Then the sweep (scripts/live/flows/r4.mjs)
    on 10 styles: done and clean, as on base; one light/dark pair of /w at 390 and of the maker tray.
 3. Pickers: every file input in the diff (accept list); a HEIC by drag and drop on the tray and on the Vault; a 503 at confirm and Try again (count
    the upload tickets and puts); Remove, Add, Try again: hover, focus-visible, active measured. No localStorage, sessionStorage or IndexedDB writes.
 4. `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint` (863 or fewer), `npm run check:css`, `npm run build`; the new
    flows w10d-sizes.mjs and w10d-pickers.mjs and w5-maker2 on the branch; no tsconfig, scripts/gates/** or baseline file in the diff.
Write $S/build/verify/w10d/VERDICT.md (30 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line and picture paths, NOT run.
Stop your stacks by PID; remove your worktrees (keep the pictures you cite). Hand back ONCE in 15 lines.
