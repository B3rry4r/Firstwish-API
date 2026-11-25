CHECK P7A (Phase 7 smoke: photo privacy at the bytes) | TIER T2 (personal data: GPS and device tags) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, only when `free -g` shows 5 GB or more (another job runs here); tests ONLY through `npm test -- ...` with `--maxWorkers=2` and
TEST_DB_PREFIX=vp7a; never pkill, killall or pgrep -f (stop only PIDs you started); never edit, build, checkout or reset anything in /home/user/Firstwish-API
or /home/user/Firstwish-web themselves. S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Notes to $S/build/verify/p7a/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md; rulings IM1, IM1a, IM2, IM3 (grep build/rulings-phase3.md); build/handover/verdicts/api-base-23-VERDICT.md
(its NOT RUN line is your work).
Under test: API ccr-91b3ed11-fx445c in your own detached worktree $S/build/wt/v-p7a (`npm ci`, `npx prisma generate`); stand-ins; ports 5600-5619.
Make test files that CARRY tags (exiftool if present, else a JPEG with an EXIF GPS block written by sharp or by hand; an m4a and an mp4 with a location
tag written by ffmpeg -metadata location=...), upload and confirm each through the real routes, then FETCH THE BYTES each reader hands out and read
the tags (exiftool or ffprobe -show_format; for JPEG also grep for "GPS" and the camera serial):
 1. the feed cover; 2. a friend's view of a group wish; 3. a business's read of its client's wish; 4. the wish video download (R6 is merged: with
 RENDER_ADAPTER=chromium and the built web only if cheap, else say NOT RUN); 5. the data export (every photo, voice and clip inside it).
 Also: the receiver's /w read, and each sized copy (w320, w768, w1600). For each: the address, the bytes' size, the tags seen (none expected).
 And: a HEIC upload is refused in the words of IM2; a file the server cannot clean is refused in words (IM1a, IM3).
Write $S/build/verify/p7a/VERDICT.md (30 lines or fewer): PASS or findings by severity (a tag that reaches anyone but the owner is HIGH) with
file:line; NOT run. Stop what you started; remove your worktree; drop your databases. Hand back ONCE in 12 lines.
