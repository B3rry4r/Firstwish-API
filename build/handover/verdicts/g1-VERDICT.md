# VERIFY-G1 verdict: MERGE
Web g1 0ff0835 against base 8ec7682; API 471025c; stacks vg1 (branch, built) and a base web on 5742 reading the same API. Wish: gallery, three different photos (testsrc, mandelbrot, gradient) uploaded through the API, sizes made (w768 served).
1. /w/<slug> past the gate, all 7 stops: branch 360 and 1440: 0 page errors, each photo drawn on its plane (stops 1, 5, 6). Base 360: 6 errors, 1440: 7 errors, all "e is not a function"; base frames show EMPTY WHITE frames for every photo (what a receiver saw). Pictures: /tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad/build/verify/g1/pics/m-br360.png, m-br1440.png, m-base360.png, m2.png.
2. Render page 1080x1920 (r4 copy with three different photos): gallery case done, clean, 0 controls, no flat shapes (14 s stepped); photos 1 and 3 seen in the five frames (photo 2 fell between samples). r4.mjs finds no gallery endings in the manifest, so only the default case exists.
3. Photo address blocked (one, then all three): the dark blank in the frame, walk goes on, no loop; the only console line is the browser's own one failed-request line per photo (1 for one blocked).
4. tsc 0; gates 0 fail 0 warn (289 accepted, none new); lint 770 problems (0 errors) <= 863; build OK; diff = Scene.tsx (1 line) and room.ts (8 lines) only.
Findings (none blocks): 
- LOW components/styles/stage/gallery/Scene.tsx:389-391: on the render page the nav plate and chapter label ("Swe...", "The l...") still draw along the bottom (Back/Next and count are hidden; same on base). Not in the claim; r4's check passes.
- room.ts:~96: crossOrigin only when src is http(s); data and same-origin paths load as before.
NOT run: test:client, check:css (not in my list), api gallery endings beyond default, light/dark, real-device WebGL (swiftshader only).
