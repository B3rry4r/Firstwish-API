# R5F proof numbers (26 Nov, this machine: 4 CPUs, 15 GB; Chromium 158 build 1243, playwright-core 1.63; the web built and started beside the API)
Part 1, encode: x264 on one thread (`-threads 1 -x264-params threads=1:lookahead-threads=1:sliced-threads=0`). Studio 1080x1920, 160 frames (5.3 s), one render: 54 s with `-threads 2` and 55 to 57 s with one thread, load 7 to 9 (both include browser start); about 10 s of work per second of video either way: the screenshots, not the encoder, are the cost. Peak memory (node + Chromium + ffmpeg): 1453 MB before, 1351 MB after.
Part 2, M3: the spec could not be made to fail here (8 pairs of the M3 wish at load 18 to 23: 0 of 114 frames differ each, old and new code). A real frame is now drawn (two native frame callbacks from a separate script world of the page) before every shot. Found on the way: H1 hung under the W19 clock (it asks the page for a frame callback, which now runs only when time moves): the spec's page now asks for its own time-0 frame, as the web's render page does.
Part 3, real wishes through ChromiumVideoRenderer, 1080x1920, epochMs 1700000000000, twice, framemd5:
| wish | frames | differing | per render |
| studio | 160 | 0 (x3 pairs) | 45 to 57 s |
| letter | 160 | 60 in the first pair; 0 in 4 later pairs (frames dumped) | 49 to 54 s |
| reel | 369 | 0 | 107 s |
| owambe | 215 | 0 | 250 and 277 s (load 4.7) |
| polaroid-table | 215 | 0 at load 7.4 | 61 s |
Part 4: PROCESS_ROLE=web + render-worker, RENDER_ADAPTER=chromium, built web: a Studio wish asked through POST /v1/wishes/{id}/video: done in 48 s; download 200 video/mp4 649258 bytes; h264 yuv420p 1080x1920 30/1, 14.57 s; another account: read 404, ask 404. Frames: studio-1..3.jpg.
Part 5: see the hand-back.
