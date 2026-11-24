VERIFIER API-BASE-22 | TIER T2, short (people's photos; a real adapter and a new storage read) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, tests ONLY through `npm test -- ...` or `npm run test:affected -- ...` with `--maxWorkers=2`, in the FOREGROUND, only when `free -g`
shows 6 GB or more; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves;
notes to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-22/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md and /home/user/Firstwish-API/build/prompts/API-BASE-22.md (its cases are the contract).
Under test: /home/user/Firstwish-API local branch `api-base-22` (head 5eddf1f) against its base 9ea632f. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab22 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=vab22. Make REAL pictures for your probes (sharp
is installed by npm ci; ffmpeg and ImageMagick-free: use sharp or ffmpeg to make them; add EXIF with a small script).
The builder's claims: `SharpImageSizes` is bound for PROVIDERS=live and MissingImageSizes is gone; a new
StoragePort.readObject(key, maxBytes) on the S3 adapter and the stand-in; source cap 100 MB, pixel limit 128 MP refused
from the header; a 12 MP JPEG costs about 39 MB and 0.3 s a size, a 50 MP PNG about 146 MB; turned by EXIF, never
enlarged, aspect kept, the copy has NO metadata (GPS, make, serial); JPEG, PNG, WebP keep their type; GIF and animated
WebP are sized from the first frame; HEIC cannot be decoded (fails with words); a bomb, a broken file or a wrong
type is refused and writes nothing; widths 320, 768, 1600; a failed resize leaves the file ready at its original,
retried with backoff, dead after 5; the staff Providers read shows image sizing under Storage. One older test's
constructor call changed (test/int6/ping.spec.ts). It did NOT run the full suite. It saw ab21-clips and ab21b-clips
fail together at 2 workers (a 409 on a ticket: the two specs share the database).
Attack (each PASS or FAIL with numbers; a copy that keeps a position, or a file that takes the process down, is HIGH):
 1. Metadata: JPEG, PNG and WebP each with GPS, a camera serial, an XMP block, an ICC profile, an embedded
    thumbnail that itself holds GPS: the three sized copies hold none of it (exiftool is not here: read the bytes
    for the Exif, XMP and GPS markers, or use sharp's metadata()); colours still right (the ICC handling: an
    Adobe RGB or P3 source is not washed out: compare a pixel).
 2. Orientation: all eight EXIF orientations: the copy is upright and its width is the asked width.
 3. Hostile files: a 20000 x 20000 PNG of a few kilobytes (a bomb), a JPEG whose header claims 60000 x 60000, a
    truncated file, a GIF of 2000 frames, an SVG renamed .png, a 0-byte file, a 101 MB file: each refused with
    words, the process's memory before and after (no leak over 50 runs), nothing written, the job's state.
 4. readObject on the REAL S3 adapter: read its code: range, the maxBytes cap honoured BEFORE the body is read
    into memory, errors mapped; and that no other caller can now read a whole 100 MB object by accident. (No real
    bucket here: say what is unproven.)
 5. The job through the queue's tick: three widths made under their own keys; a second run makes nothing twice; an
    erase of the wish while the job runs leaves no sized copy behind; twenty photos confirmed at once: how long,
    how much memory (is there a limit on how many resize at once?).
 6. The flaky pair: run ab21-clips and ab21b-clips together ten times at 2 workers: how many fail, and why (which
    shared row); is it this branch's doing (run on the base too)?
 7. typecheck; the WHOLE lint; scripts/gates.sh; check-contracts, check-drift, check-routes; the ports, stored-files
    and staff-reads specs. Do NOT run the full suite (the lead's merge check runs it).
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-22/VERDICT.md (30 lines or fewer): MERGE or FIX FIRST, findings by severity
with file:line. Drop your databases, remove your worktree. Hand back ONCE in 12 lines.
