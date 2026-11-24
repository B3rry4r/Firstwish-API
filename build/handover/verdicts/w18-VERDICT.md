W18 verdict: MERGE (no blocker; two notes)
1 tests: branch 16/16 pass (10 + case 3 with --origin against next start); base clock: 7 of the 10 fail (1a,1b,4,2a,2b,2c,2f), 2d/2e/1c pass as expected.
2 case 5 (gele scroll, cap-toss film), portrait, base script vs branch script, 4 recordings: frame counts equal (288/288, 359/359). Frames NOT equal:
  gele 236/288 differ, cap-toss 168/359 differ (from frame 0). CAUSE: previews are not repeatable even with ONE script: base vs base (2 runs) 229/288 and
  359/359 differ; branch vs branch 236/288, 359/359; cap-toss count itself varies by run (359 vs 392: "opened on try 2/3"). Late freeze() + live
  page randomness/real time before the freeze. So "equal frames" is unprovable by this method; branch differs from base no more than base from itself, and in the same
  small regions (gele bbox 112,447-272,529 in both). Late-freeze path in the shim is unchanged code (fixed=false). Not proven bit-identical: say so.
3 probe page (CSS anim, WAAPI, timer transition, rAF, late CSS anim) frozen from first script with epoch, 2 recordings x 301 frames: 301/301 equal.
  Ends at the right time over 300 steps: css 1999.99, WAAPI 3000.00, no drift. NOTE (by design): an animation/transition first seen in step k starts at the
  start of that step: timer at 1000ms -> ends 2966.7 (33.3 ms = one step early), bounded, no accumulation. Only when frozen from start.
4 /render-clock.js on next build+start: GET and HEAD 200, text/javascript, 7283 bytes == CLOCK_SHIM, no set-cookie, max-age=300, nosniff, POST 405;
  prerendered (.next/server/app/render-clock.js.body, "○ static"), one source scripts/lib/clock-shim.mjs; no abs path/node words/secret in it. Only one new route.
5 node --check ok; tsc 0; lint 0 errors, 863 warnings (same as base 863); gates 0 fail 0 warn (0 new); diff: 4 files (route.ts, clock-shim.mjs, stepped-clock.mjs,
  test.mjs); none under public/previews, tsconfig or gates.
Findings: LOW scripts/lib/stepped-clock.test.mjs: case 3 SKIPs (exit 2) without --origin, so "16 pass" needs a running build. LOW clock-shim.mjs sync(): 1-step-early start above.
