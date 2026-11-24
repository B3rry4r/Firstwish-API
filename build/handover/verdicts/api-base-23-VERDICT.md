VERDICT API-BASE-23 (head 05ca199 vs base 5c5e95e): MERGE (no HIGH; two MEDIUM/LOW notes below are for a later round)
HIGH: none found. No position, serial, XMP or thumbnail reached a non-owner by any route I could reach; no lost or broken media.
MEDIUM
 M1 src/modules/stored-files/stored-files.service.ts:~405-411 (image clean in confirm): ANY error from the clean (a 504 PortTimeoutError from the
    60 s imageSizes limit, a storage timeout) becomes refused(...) = 422 and the upload is DELETED; the media branch (~420) maps timeouts to 503.
    A slow server loses a good photo. Code-read only, not run.
 M2 src/modules/stored-files/photo-cleaner.ts cleanStored (~46-55): read, rewrite, then putObject at the key with no check the row still exists:
    an erase between read and put can leave an orphan clean object under an erased file's key. Not run (narrow window).
LOW
 L1 sharp-image-sizes.adapter.ts:~57 (clean): 16-bit PNG comes out 8-bit (probed: ushort -> uchar); APNG is flattened (libvips reads one frame);
    no words say so. P3 and CMYK convert to sRGB through the library (CMYK probed: 199,100,43 vs 199,100,44); the profile is dropped.
 L2 studio-files.service.ts:40 (public style read) and pro-business.service.ts:101 do not catch photo_not_shown 404 for a legacy uncleanable file:
    one old HEIC asset 404s the whole read (others leave the file out). No real rows exist today.
 L3 Claim "36 specs, no expectation changed" is not exact: stored-files/tests/ab22-sizes-job.spec.ts changed 2 expectations (original equals ->
    clean 2400x1600 and no exif) and a seed (justified by IM1a); ab22-r1-race.spec.ts got a clean() passthrough. The other 34 are cleanAt seed lines only.
 L4 registry: three existing field types widened in text (array -> array<...>, string -> string (kinds...), typeBy DEC-220 -> DEC-328) and frozenAt moved; nothing removed. Additive in substance.
 L5 stored-files folder: 1 of 3 runs had 2 failures (ab22-r1-race M1 confirm 422; ab21b-clips 409), 97/97 on the other two and on 4 reruns of those two files. Not the same "known pair"; cause not found (cold first run).
 L6 a mp3 sent as audio/mp4 is refused (422, words) rather than accepted; fine. Re-confirming an already clean JPEG re-encodes it (pixel diff 1).
PROVEN
 - Every address: grep signDownload|presign|getSignedUrl: only SignedUrlsService.grant (signed-urls.service.ts:99) and clip-length (providers.module.ts:115, a 300 s address handed to ffprobe on the server only, after clean). All 20 readers call signedRead/signedSet; cleanFirst gates all but owner/vault-owner.
 - Staging key is written only through the ticket's PUT, never signed for GET, deleted after confirm / by the sweep; a crash leaves status uploaded (never readable), reaped by sweepUnconfirmed (deletes both keys).
 - Photos (real adapter, probed): 12 MP 4000x3000 4.29->4.87 MB, 1.9 s, no leaks; orientations 1-8 upright, dims swap for 5-8; PNG alpha, WebP alpha, GIF 3 frames and delays, animated WebP 3 frames kept.
 - Media (real ffmpeg, probed): 30 s clip 30.000->30.000 s, rotation 90 kept, fragmented, moov-at-end (output moov first), mov, webm, ogg, wav, mp3, m4a: streams and length kept, decode clean; junk refused.
 - Migration 20261211090000: up on 2 seeded rows keeps them, cleanAt null; DOWN comment works; migrate status clean (scratch DB dropped).
 - Registry: Wish.limits, variants, HEIC words, statusMaxSeconds 60 match the code and d.ts. check-contracts, check-drift, check-routes, scripts/gates.sh, typecheck, WHOLE lint all EXIT 0.
 - Web: lib/contracts copy differs from the new d.ts (32 diff lines): contracts:check WOULD ask for a sync. Not synced.
 - Folders (maxWorkers=2, vab23): public-wishes 30, wishes 123, studio 113, render-jobs 74, staff-reads 29, all green; stored-files 97 (see L5).
NOT RUN: full suite; live HTTP fetch of each route's bytes beyond the builders' specs (feed cover, friend group wish, business client read, wish video download, data export read by code only); erase-during-clean race; before/after confirm time on base (base did no clean: added cost 12 MP ~1.9 s, 30 s clip ~1.0 s).
