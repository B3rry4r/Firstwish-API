PATCH WEB-10D round 1 | TIER T1 (screens that show photos; maybe the server's sized-copy read) | Budget 90 steps. Close the named findings. Nothing else.
Same rules as /home/user/Firstwish-API/build/prompts/WEB-10D.md lines 2 to 4 (read them; logs $S/build/logs/p10d-*.log). Another job may run here.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Read build/prompts/WEB-10D.md (the contract) and build/handover/verdicts/web-10d-VERDICT.md.
Work: web branch `web-10d` head d37b48a in your own worktree $S/build/wt/p10d (`git worktree add $S/build/wt/p10d web-10d`, `npm ci`); API worktree
$S/build/wt/p10d-api as a NEW local API branch `p10d-api` from ccr-91b3ed11-fx445c (head in your spawn line; `npm ci`, `npx prisma generate`); stack
by scripts/live/stack.mjs (name p10d, ports 5300-5319, TEST_DB_PREFIX=p10d), BUILT. Test on the REAL stack: upload three 2400 px JPEGs through the
maker and wait for the sizes (never a mocked read).
 H2 FIRST: every sized variant url answers 404 on the stack (the full url 200). Find where (file:line): the API's signing or serving of a size, the
    stand-in storage, or the web. If it is in the API, fix it on p10d-api in the files that make, store, sign or serve the sizes, with a spec, and
    run that module's specs, typecheck, `npm run lint`, scripts/gates.sh, check-contracts, check-drift, check-routes (no registry change). And on
    the web: SizedImg.tsx:34-37 falls back to the full copy once when a size fails to load (no loop).
 H1 the owner's wish, wish list and home draw the full copy where sizes exist (a 92 to 104 px thumb fetched 4.37 MB; WishCard.tsx:37-42):
    registerPicture is called only from lib/files.ts:52 and lib/engine/adapt.ts:249: every read that carries `variants` feeds SizedImg.
 M3 /w fetches p2 and p3 twice (w1600 and w768 or w320): find the second fetch and leave one per drawn photo (the stage's own w1600 for a style
    that needs the photo's shape is allowed only if the drawn copy reuses it).
 M4 scripts/live/flows/r4.mjs's "only allowed requests" check fails for film and studio (stand-in storage photo urls; a css referer): its allow-set
    knows the size urls; compare with base dae0324.
Prove on the real stack: /w at 360, 390 (2x, 3x) and 1440 (1x, 2x), the owner's wish, list and home: bytes fetched, the width each <img> asked for,
0 broken, 0 full copies where a size exists, 0 upscaled; the render page at 1080 x 1920 uses w1600; r4.mjs on film, studio and 8 others: done, clean.
Checks (web): `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint` (863 or fewer), `npm run check:css`, `npm run build`;
w10d-sizes.mjs, w10d-pickers.mjs and w5-maker2 green. Commit on web-10d (and p10d-api); do not push; stop your stack by PID; remove your worktrees;
drop your databases. Hand back ONCE in 10 lines: heads; the 404's cause (file:line); each finding with numbers; NOT run.
