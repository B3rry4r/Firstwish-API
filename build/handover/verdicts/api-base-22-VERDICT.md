# VERDICT API-BASE-22 (api-base-22 5eddf1f vs 9ea632f): FIX FIRST (no HIGH; one MEDIUM)
MEDIUM  src/modules/stored-files/file-jobs.ts:346-358 (makeImageSizes) + :303 (dropFile): erase during the job leaves a sized copy behind.
  Probe (erase between w320 and w768): file row gone, `...w320` object stays in storage. dropFile deletes only the keys in the row's
  variants (none yet); the job then fails on the missing source, but what it already wrote is never removed. Same race exists inside one resize (read, erase, putObject).
  Needs: re-check the file after each resize and delete what was written, or drop `${key}.w*` keys in dropFile. Not a position leak (copies carry no metadata).
LOW     sharp-image-sizes.adapter.ts:51-58: adapter alone sizes an SVG sent as image/png (rasterised 5000x5000 to 320). Upstream finishConfirm
  (stored-files.service.ts:383, looksLikeSvg) refuses SVG by signature first, so unreachable today; no sniff in the adapter itself.
LOW     no limit on resizes at once other than the tick running jobs one at a time (max 1 seen); each width re-reads the whole source (3 reads of up to 100 MB per photo).
PASS 1 metadata: JPEG/PNG/WebP with GPS, Make, serial, XMP, ICC(P3), IFD1 thumbnail make: all 3 sizes have no exif/xmp/icc/iptc and no GPS/Exif/xmpmeta bytes. P3 pixel (255,90,20) came back (255,92,15)/(255,90,19)/(255,89,15): not washed out. Adobe RGB not tried (no profile file here).
PASS 2 orientation: 1..8 x JPEG/PNG/WebP, quadrant colours upright, width 320 each.
PASS 3 hostile: 20000x20000 PNG bomb (1.1 MB), JPEG header 60000x60000, truncated, 0-byte, garbage, wrong type, 101 MB (refused before decode), HEIC (words, sharp here has no HEIC decoder): all refused with words, nothing written (fresh storage per case). 50 runs each: rss delta 0-31 MB (gif 31, bomb 21, rest 0-3), no growth trend, peak 240 MB. GIF 2000 frames / animated WebP 12 frames: first frame, 1 page.
PASS 4 (read, not run): S3 readObject checks ContentLength > maxBytes before reading the body and destroys the stream; 404 mapped to null. UNPROVEN: no real bucket; no Range (a missing ContentLength would read whole body then check); non-404 errors rethrown raw. Only the sharp adapter calls readObject, cap 100 MB.
PASS 5 tick: 3 widths under own keys, second makeImageSizes made 0, 20 x 12 MP (7.6 MB) photos: 13.3 s, jest rss 801 to 921 MB, 1 resize at once. 12 MP JPEG: 320 = 143 ms/+11 MB, 1600 = 444 ms/+39 MB; 50 MP PNG (48 MB file): 539 ms/+90 MB at 320, 2.4 s/+98 MB at 1600.
PASS 6 flaky pair: ab21+ab21b alone, 2 workers: 0/10 failed on branch, 0/10 on base. In the group stored-files + ports + staff-reads at 2 workers both fail (5 tests, ticket start 409) on branch AND base: not this branch; shared row not pinned down.
PASS 7 typecheck, whole lint, gates.sh, check-contracts, check-drift, check-routes all EXIT 0; ports, stored-files, staff-reads, int6/ping: 167 pass, only the ab21 pair fails (same on base).

## Round 2 (c3b861c): MERGE
M1 closed. Probe specs (r2-specs/) run with the real adapter: erase between w320/w768, during the w768 write, during the w320 write, two erases at once (twice), erase fired inside putObject so the put lands after it: row gone, 0 objects under the file's keys in all 6.
  Order left in which a copy survives: none found. A write landing after the row is gone is removed by the job's re-check (it runs after every write and after the row save); one landing before is removed by the erase's second pass.
  Only remaining case: the job throws mid-way (source missing) with the row still there: its copies stay listed under the row's keys and the later erase removes them by rule (not a leak).
L3 closed: reads 20 for 20 photos (7.6 MB each), one per photo; arrayBuffers 202->206 MB, heap 117->107 MB after gc: source not kept.
L4 closed: 3 chunks of 40 over limit 70: stops after the 2nd, stream destroyed; exact-limit read whole in order (AAAABBBCC); 1 byte over refused; wrong small ContentLength with big body also stops.
Round 1 passes hold: metadata (JPEG/PNG/WebP: no exif/xmp/icc/GPS bytes, P3 not washed), orientation 1-8, bomb/60000 header/truncated/garbage/101 MB refused, 50-run rss delta 0-30 MB. Still open and unchanged: LOW adapter-alone SVG-as-png (unreachable upstream).
typecheck, whole lint, gates.sh exit 0; ports + stored-files folders: 132 pass, 5 fail, all in the ab21-clips pair (known).
