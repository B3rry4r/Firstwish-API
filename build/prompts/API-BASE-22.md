BUILDER API-BASE-22 | TIER T2 (people's photos; a real adapter that was never built) | Budget 100 steps. The real image-sizing adapter. Nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2`; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves.
Read /home/user/Firstwish-API/build/common-rules.md; src/common/ports/image-sizes.port.ts (the port; its comment says the real adapter "is built in the wave that merges the jobs frame":
it never was: with PROVIDERS=live `MissingImageSizes` rejects every request, so on the real server every photo's sized copies would fail);
src/common/ports/providers.module.ts (:100), src/modules/stored-files/file-jobs.ts (the job that calls it: which widths, when, what a failed run does
to the file and to what a person sees), src/common/ports/storage.port.ts and adapters/s3-storage.adapter.ts, standins.ts (StandinImageSizes).
Work: /home/user/Firstwish-API, local branch `api-base-22` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-22 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=ab22. Do not edit a gate or a baseline; no
wire change; no registry reopen; no older test's expectation changed (name any you must).
Build `SharpImageSizes implements ImageSizesPort` (src/common/ports/adapters/) and bind it for PROVIDERS=live; `MissingImageSizes` goes.
 1. It reads the source through the storage port, makes the asked width, writes the target through the storage port;
    the bytes are streamed or bounded (say the largest photo the upload rules allow and the memory a resize of it
    takes: measure with a real 12-megapixel JPEG made here); never enlarges; keeps the aspect.
 2. Orientation and privacy: the picture is turned by its EXIF orientation, and the sized copy carries NO metadata
    (no GPS position, no camera serial): prove with a file that has both. Say what the ORIGINAL keeps (report only:
    if originals keep GPS and are ever served to a receiver, that is a finding for the lead, not a fix here).
 3. Formats: every type the upload rules accept (read them from the screening rules: JPEG, PNG, WebP, and HEIC if
    accepted: say what sharp's build here can decode; a type it cannot decode fails with words, and say what the
    person then sees); animated files; a broken or hostile file (a decompression bomb: a pixel limit) is refused,
    never crashes the process or eats the memory.
 4. The dependency: `sharp` is a native module: add it properly (package.json, the lockfile), say what the real
    server needs for it (a deploy item: the platform's prebuilt binary; nothing to install by hand?), and keep the
    tests able to run where it is missing only if the repo's CI lacks it (check the CI workflow; prefer that CI has it).
 5. The job: with the real adapter bound, the file job makes each size the product reads (list the widths and who
    reads them) through the stand-in storage in a test; a failed resize leaves the file usable at its original and
    the job retried or parked as the jobs frame says: say which.
 6. With PROVIDERS=live the staff Providers read shows image sizing as set up (find how the others report it).
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
stored-files and ports folders' specs; do NOT run the full suite (the lead's merge check runs it). Commit on
api-base-22; do not push; remove your worktree. Hand back ONCE in 10 lines.
