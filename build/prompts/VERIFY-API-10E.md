VERIFIER API-10E and WEB-10E (ruling IM4) | TIER T1 (photo reads; 21 API files, 15 web files, one registry reopen) | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
Same rules as /home/user/Firstwish-API/build/prompts/API-10E.md lines 2 to 4 (read them; TEST_DB_PREFIX=va10e). The lead's live test runs here. Notes to $S/build/verify/a10e/NOTES.md.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Read build/prompts/API-10E.md (the contract); rulings IM1 to IM4; build/prompts/INT-7.md lines 9-10.
Under test: API branch `a10e` head b4b544c (on 2524a96) in your own detached worktree $S/build/wt/va10e (`npm ci`, `npx prisma generate`); web branch
`w10e` head e9c49e4 (on 8ec7682) in $S/build/wt/vw10e (`npm ci`); base worktrees at API 2524a96 and web 8ec7682 if you need them. Stack by
scripts/live/stack.mjs (name va10e, ports 5500-5519), BUILT, API_DIR at your API worktree. Upload real 2400 px JPEGs (sizes made).
Claims: `variants` added on the Vault files, shoot files, proofs and finals, GET /r/:code (`photoVariants`), staff moderation heldPhoto,
/play-wishes/:id files, /showing and /creators (`imgVariants`), /me picture, the brand logo, concierge order files, Studio style files; DEC-330
reopen and DEC-331 freeze, reconcile twice identical; a non-image carries none; the web feeds registerPicture from each read.
Attack (a size that leaks to someone who could not read the full photo, a size that carries the original's tags, an id that changed, a broken
or full-copy photo where a size exists, is HIGH):
 1. Registry: only additive fields (diff the registry and the contract files; no id, name or type changed or removed); check-contracts, drift, routes.
 2. Access: for each changed read, another account, a signed-out caller and a wrong code get what they got on base, and no size url for a photo
    they could not read; a size url's signature expires like the full copy's.
 3. Bytes: one size from each of three reads: no EXIF or GPS (exiftool or a byte search), a clean copy as IM1 says.
 4. On the real stack at 390 and 1440: the Vault, a shoot page, a reveal, moderation's held photo, /showing, a creator page, Me: which width each
    photo asks for, 0 full copies where a size exists, 0 broken.
 5. API: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; the touched modules' specs. Web: `npx tsc --noEmit`, `npm run gates`, `npm run
    test:client`, `npm run lint` (863 or fewer), `npm run build`; no tsconfig, gates or baseline file in either diff.
Write $S/build/verify/a10e/VERDICT.md (30 lines or fewer): MERGE or FIX FIRST, findings with file:line, NOT run. Stop your stack by PID; remove your
worktrees; drop your databases. Hand back ONCE in 15 lines.
