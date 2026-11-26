BUILDER API-10E (ruling IM4) | TIER T1 (photo reads; no money, no identity) | Budget 110 steps. Every read that hands out a person's photo carries its sized copies, and the website draws them. Nothing else.
ONE heavy job at a time, only when `free -g` shows 5 GB or more (the lead's live test runs here); tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2` and TEST_DB_PREFIX=a10e; NEVER commit the web's tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started); never edit,
build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves; no command over 8 minutes; quiet logs ending in an EXIT line.
S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Read /home/user/Firstwish-API/build/common-rules.md; rulings IM1 to IM4 (END of
build/rulings-phase3.md); build/handover/verdicts/web-10d-VERDICT.md; build/prompts/INT-7.md line 9-10 (how a reopen is done); how `variants` is made today
for Wish.pictures and PublicWishView.files (grep the registry and src for "variants"); the web's lib/pics.ts and components/SizedImg.tsx (read only first).
Work: API branch `a10e` from ccr-91b3ed11-fx445c (head in your spawn line) in your own worktree $S/build/wt/a10e (`npm ci`, `npx prisma generate`); web
branch `w10e` from web ccr-91b3ed11-fx445c 8ec7682 in your own worktree $S/build/wt/w10e (`npm ci`); stack by scripts/live/stack.mjs (name a10e, ports
5480-5499, TEST_DB_PREFIX=a10e), BUILT, API_DIR at your API worktree.
 1. List every read that hands out a person's photo without `variants` (the Vault's files, a reveal, staff reads such as Moderation, any other):
    route, response field, file:line. Then ONE additive registry reopen: `variants` on each (the same shape as Wish.pictures'), DEC rows citing
    IM4, reconcile twice identical, freeze; the web's contracts synced (`contracts:sync`) and `npx tsc --noEmit`.
 2. Each read signs its sizes the way Wish.pictures does (no new signing code); a non-photo file carries none; specs per read: sized, not yet
    sized, and another account's read still refused.
 3. Web: each of those reads feeds registerPicture (as lib/person.ts does for Wish.pictures), so SizedImg draws the size that fits.
Prove on the real stack (photos uploaded, sizes made): each screen at 390 and 1440: bytes fetched for photos before and after, 0 full copies
where a size exists, 0 broken.
Checks: API: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the touched modules' specs (not the
full suite). Web: `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint` (863 or fewer), `npm run build`.
Commit on a10e and w10e; do not push; stop your stack by PID; remove your worktrees; drop your databases. Hand back ONCE in 10 lines: heads; the
reads changed (route, field); DEC ids; numbers; NOT run.
