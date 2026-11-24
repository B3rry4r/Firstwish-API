VERIFIER API-BASE-23 | TIER T2, full (people's photos, voices and clips: privacy; a migration; a registry reopen) | Budget 95 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2` and TEST_DB_PREFIX=vab23 on EVERY test command; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in
/home/user/Firstwish-API or /home/user/Firstwish-web themselves; no single command over 8 minutes; notes as you go to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-23/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md; build/prompts/API-BASE-23.md and API-BASE-23B.md (their cases are the contract); rulings IM1, IM1a, IM2, IM3, HP3, II4 (the
END of /home/user/Firstwish-API/build/rulings-phase3.md). Under test: local branch `api-base-23` (head 05ca199: four commits) of /home/user/Firstwish-API against its base
5c5e95e. Your own detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab23 (`npm ci`, `npx prisma generate`). Make REAL files for your
probes (sharp and ffmpeg are here): pictures with GPS, a serial, XMP and an embedded thumbnail holding GPS; an m4a and an mp4 with location and device tags.
The builders' claims: confirm re-makes a picture without metadata and it REPLACES the upload at the file's own key (hashed, counted, sized, kept,
erased with the file; column cleanAt, migration 20261211090000); every address comes from SignedUrlsService and nothing else signs a download;
an unclean stored file is handed to no one but its owner, cleaned on first ask or by the cleanup job; the three reads carry variants (w320, w768,
w1600, `sized`); HEIC and HEIF refused at start and at confirm with words; voices, clips and Studio media are rewritten by ffmpeg with no tags
(MediaCleanPort, real adapter + stand-in), refused when ffmpeg cannot rewrite (422) or is missing (503); the Providers read shows ffmpeg and ffprobe;
36 older specs had `cleanAt` added to seeded rows, no expectation changed; registry reopen DEC-328/329 (variants, HEIC words, statusMaxSeconds 60,
Wish.limits); checks green; folders green but for the known ab21-clips pair. The full suite was NOT run.
Attack (a position, a serial or an untouched original reaching anyone but the owner, by any route, is HIGH; lost or broken media is HIGH):
 1. Every reader, through the real routes with the REAL image and media adapters (not the stand-ins): the public
    link, the feed cover, a friend on a group wish, the render read, a business's client read, a creator's style
    files, the Vault and a shoot reveal, staff reads, the download of a wish's video, an export of the owner's data:
    fetch the bytes at each signed address and search them (EXIF, GPS, XMP, the serial string, the coordinates as
    text and as rationals, IFD1 thumbnail). List each route and its result. Is any address signed outside
    SignedUrlsService (grep signDownload, presign, getSignedUrl, storage.url)? The staging key and any temp key: who can read them, are they deleted?
 2. The window before clean: between upload start and confirm, between confirm and clean (is confirm atomic: what
    if the clean throws half-way, the process dies after the write and before the row: is the untouched upload
    still at the key and is it ever handed out?), two confirms at once, an erase during clean. Old rows without
    cleanAt: a non-owner asks first (cleaned then handed, or refused: which, and is the first ask slow or failing?).
 3. Quality and faithfulness (lost media is HIGH): a 12 MP JPEG, a PNG with transparency, a WebP, an animated GIF,
    an animated WebP, a CMYK JPEG, a P3 picture, a 16-bit PNG, each EXIF orientation: after clean it opens, is
    upright, keeps its animation or says in words why not, its colours hold (compare pixels), its size before and
    after. Is a file confirmed twice re-encoded twice? A voice and a clip after clean: plays to its end, the
    same length (ffprobe), streams kept, the clip-length rule (IL1a) still reads the right length; a rotated phone
    video keeps its rotation (the display matrix); an mp4 with the moov at the end; an m4a that is really an mp3.
 4. HEIC: start and confirm refusals with the words; a HEIC named .jpg; a legacy stored HEIC: what each reader gets.
 5. The migration: up on a database with rows (seeded from the base's schema: make stored files first, then
    migrate): rows keep working, cleanAt null means unclean; the DOWN comment is right; prisma migrate status clean.
 6. The registry reopen: read DEC-328/329 and the diff of .pipeline/registry.json and the declared files: additive
    only (nothing removed or retyped), the wire matches (hit each read and compare the fields with the registry),
    check-contracts, check-drift, check-routes. In the web repo (read only) would `contracts:check` now ask for a sync? (Say; do not sync.)
 7. The 36 older specs: `git diff 5c5e95e 05ca199 --stat -- '*.spec.ts'` and read a sample of ten: only seed rows
    changed, no expectation, no skip, no loosened matcher. Cost: confirm's time for a 12 MP photo and a 30 s clip before and after this round.
 8. typecheck; the WHOLE lint; scripts/gates.sh; the stored-files, public-wishes, wishes, studio, render-jobs, staff-reads
    folders (the ab21-clips pair is known: say its count). Do NOT run the full suite (the lead's merge check runs it;
    if your session refuses a command, do not retry and ask nobody: say NOT RUN).
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-23/VERDICT.md (35 lines or fewer): MERGE or FIX FIRST, findings by severity
with file:line. Drop your databases, remove your worktree. Hand back ONCE in 14 lines.
