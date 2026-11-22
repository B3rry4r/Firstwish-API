PATCH P-API-BASE-14 round 1 | TIER T2 | Budget 50 steps. Close G1-G5 from the check; change nothing else.
ONE heavy job at a time, jest with `--maxWorkers=2`; commit per finding; final runs in the FOREGROUND.
Read ruling II5a (it narrows II5) in /home/user/Firstwish-API/build/rulings-phase3.md and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-14/VERDICT.md (the probes p1..p5 beside it are the documents the web's editor
really saves: use them as your test documents). Work: branch `api-base-14` (6e02fe9) of /home/user/Firstwish-API in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-14 (`npm ci`, prisma generate); TEST_DB_PREFIX=ab14; ports 5200-5209.
 G1 BLOCKER-class (an honest save refused): the web adds an art item {id: <file id>} to the shelf as soon as the
    upload is "screening" (web components/app/studio/Files.tsx:29); the head answers 422 "still being checked" for
    the WHOLE save until screening ends. II5a: the shelf may hold the style's own files in any state; only a USE
    needs a ready file; the send-in is refused in words while a shelf file has not passed checking.
 G2 an older art item with a non-uuid id and no fileId (or fileId null), named by the sound, a backdrop, an
    artwork or fill.art, is 422 (the base took it): it names no file; it saves as before
    (src/modules/studio/submission-checks.ts:46-47).
 G3 HOLE: the web places a 3D model as an added thing of kind "three" (three.shape "model", `what` = the file id).
    fileRefsOf checks `what` only for kinds artwork and model, so ANY id (another creator's, held, random) saves
    and sends in, and withoutFile leaves it after a removal. Read /home/user/Firstwish-web/lib/studio.ts (the added-thing kinds) and
    cover every shape the editor writes that names a file; the kept-file rule (II4) and the strip cover it too.
 G4 a `what` that is a house bank slug (not an art id, not id-shaped) is 422: II5a leaves it alone.
 G5 LOW the public LIST of styles still carries creator.creatorId for an erased creator: none there either.
Tests for each (the verifier's 20 web documents save and send in on the head exactly as on a590870; the 11 places
by 13 bad names still refuse, now with kind "three" among the places; a shelf-only held file saves, a USED held
file does not; the send-in with a held shelf file is refused in words).
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, gates.sh, check-contracts, check-drift,
check-routes, the studio specs, then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0 failed. Commit
on api-base-14; do not push; remove your worktree. Hand back ONCE in 8 lines: head; G1-G5 with file:line and the
tests' names; totals.
