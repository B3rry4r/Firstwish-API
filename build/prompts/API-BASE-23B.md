BUILDER API-BASE-23B | TIER T2 (people's photos and voices: privacy) | Budget 110 steps. Finish round 23: what its first run left NOT DONE. Nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2` and TEST_DB_PREFIX=ab23b on EVERY test command; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in
/home/user/Firstwish-API or /home/user/Firstwish-web themselves; no single command over 8 minutes; quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md; /home/user/Firstwish-API/build/prompts/API-BASE-23.md (the round's contract); rulings IM1, IM1a, IM2, IM3 (the END of
/home/user/Firstwish-API/build/rulings-phase3.md); `git diff --stat 5c5e95e api-base-23` and the two new specs (ab23-photos, ab23-render-photos).
Work: the local branch `api-base-23` (head 6739a80) of /home/user/Firstwish-API in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-23b (`git worktree add <path> api-base-23`, `npm ci`, `npx prisma generate`). Do not edit a gate or a
baseline; an older test changes only where a case makes its expectation wrong (name each).
Do, in this order (commit after each, so nothing is lost if you run out of steps):
 A. The registry reopen the first run did not reach (ONE reopen, additive, DEC rows): the photo views' `variants`
    (w320, w768, w1600, `sized`) on the owner's wish read, the public link's view and the render read; the upload's
    refusal words for HEIC; `videoRender.statusMaxSeconds` 60 (IK6a) in .pipeline/declared/video-render.json and
    its DEC row; `Wish.limits` (round 21, IL1a) in the registry. Then check-contracts, check-drift, check-routes.
    If your session refuses a registry command, do not retry and ask nobody: say NOT DONE and go on to B.
 B. The first run's unproven parts: its owner-wish-read cases call WishPictures directly "because a shared test
    database lacked the price book": make them go through the real route (own database with the seed, as other
    specs do); rerun the stored-files, public-wishes, wishes, studio and render-jobs folders: every failure is
    either the known ab21-clips pair (say its count) or yours to fix; find every OLDER spec that seeds an image row
    without `cleanAt` (the first run's named risk: with the real adapter such a row is handed to no one) and put
    each right at its seed (a seeded confirmed image is clean), never by loosening the rule.
 C. IM3: voices, clips and Studio media lose their location and device tags at confirm: a small port with a real
    ffmpeg adapter (`-map_metadata -1 -c copy`, plus the atoms that flag misses: prove with ffprobe -show_format
    -show_streams and a byte search for the coordinates) and a stand-in; the clean file replaces the upload, is
    the one hashed, counted and kept; a file ffmpeg cannot rewrite is refused in words; a file stored before this
    is cleaned on first ask or by the cleanup job and handed to no one but its owner until clean; ffmpeg missing
    on the server: the staff Providers read says so (as it does for the clip-length reader) and uploads of these
    kinds are refused in words rather than stored unclean. Real files in the tests: an m4a and an mp4 made with
    ffmpeg here carrying a location tag and a device tag.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the five folders
above; do NOT run the full suite (the lead's merge check runs it). Commit on api-base-23; do not push; remove your
worktree; drop your databases. Hand back ONCE in 12 lines: head; A, B, C each: done or NOT DONE with the reason;
every older test changed and why; the folders' totals; what was NOT run.
