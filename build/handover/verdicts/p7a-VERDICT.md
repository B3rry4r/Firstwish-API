VERIFY P7A (head ccr-91b3ed11-fx445c cd0aa3e), T2. Result: PASS for every reader run; no HIGH. Two readers NOT RUN (below).
Method: own spec src/modules/stored-files/tests/vp7a.spec.ts (copy beside this file): real Sharp and ffmpeg adapters, real routes, bytes FETCHED from each address, tags read (bytes grep GPS/serial/maker/coords/XMP, sharp exif/xmp, ffprobe -show_format; exiftool absent).
Inputs carried: JPEG GPS+serial+maker+XMP+thumbnail+COM; m4a and mp4 with location, make, model, title, artist. All three confirmed 200.
Reader (address kind, bytes, tags seen):
 1 feed cover /v1/showing img: wish-photo key, 1,558,330 B, none
 2 friend play-wishes: photo 1,558,330 B / voice 18,748 B / clip 22,400 B, none
 3 business: owner wish read photo 1,558,330 B; vault-files photo 1,558,330 B and mp4 22,400 B, none
 /w receiver (POST opens): photo 1,558,330 B, voice 18,748 B, clip 22,400 B, none; w320/w768/w1600 before the job all point at the clean full size (sized=false), none
 sized copies after the job (w320 3,351 B, w768 36,408 B, w1600 192,446 B): none; same three in the owner's wish read: none
 owner voice-notes (data, audio): 18,748 B, none
Input 1,371,632 B JPEG came back 1,558,330 B (re-saved q92, IM1a); m4a 18,865 -> 18,748; mp4 22,537 -> 22,400.
Refusals (words): HEIC/HEIF start 422 "HEIC pictures are not taken. Send a JPEG or PNG." (IM2); HEIC bytes sent as JPEG 422 same words, row dropped;
 broken JPEG 422 "We could not open this picture. Send a JPEG or PNG."; broken m4a 422 "We could not rewrite this file to remove where and how it was recorded. Send a different recording (an MP3, M4A, MP4 or WebM that plays)." (IM3); no row kept, no staging leftover.
Code check: M1 of API-BASE-23 is fixed in words: media timeouts give 503 (stored-files.service.ts:429); image-clean mapping not re-run.
NOT RUN
 4 wish video download (GET /v1/wishes/:id/video): needs chromium and the built web; not cheap. Reader is owner-only via signedRead (render-jobs.service.ts:440); the file is a render, not a source file.
 5 data export: no data-export route exists in this head (endpoints.ts, grep export/takeout: only render purpose "export" for keepsake video). Nothing to fetch. Say so to the owner if an export is promised.
 Also not run: friend voice through /g/:slug/voice, reveal-link public read, studio files, erase race, full suite.
Findings: HIGH none. MEDIUM none. LOW/INFO: item 5 above (no export route to test).
