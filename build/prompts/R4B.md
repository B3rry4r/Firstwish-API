BUILDER R4B | the re-dispatch of R4 | TIER and rules as /home/user/Firstwish-API/build/prompts/R4.md | Budget 130 steps. Build R4 exactly as R4.md says, with these changes only.
Read /home/user/Firstwish-API/build/prompts/R4.md first (it is the brief), then ruling IK7 (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
What changed since R4 stopped (its stop was right: no way to hand a flow a token):
 - The server's stand-in now gives a test stack the token: with STANDIN_RENDER_TOKENS=<file> the stand-in renderer
   appends one JSON line {jobId, wishId, kind, width, height, seconds, token} a run, and with STANDIN_VIDEO=hold the
   job stays "rendering" until the token is spent (cap 120 s). Your flow asks for the video the real way (the
   owner's ask on a wish that holds it), reads the newest line of that file for the token, and opens /render/<token>.
 - You ALSO own, for this only: scripts/live/stack.mjs (pass STANDIN_RENDER_TOKENS=.live/stacks/<prefix>.render.jsonl
   and STANDIN_VIDEO=hold through to the API; default the same for every stack; the file is removed with the
   stack) and next.config.ts (one headers entry for /render/:path*: Referrer-Policy: no-referrer, Cache-Control:
   no-store, X-Robots-Tag: noindex). Nothing else in either file.
 - The first builder's design notes, which you may follow or better: read E-289 ONCE in the browser through
   lib/api.ts with a module-level promise for each token (so React's double run cannot read twice; the wish stays
   out of server HTML); the Studio host takes the style document from E-289 through an optional prop (no second
   request; the document conversion in lib/style-files.ts is shared, never copied); the player's host takes an
   `auto` prop that passes the opening by itself; `played()` moves from Showcase.tsx to lib/engine/adapt.ts; a
   conductor in components/render drives a scroll style by its scroller and a swipe or stage style through the
   scene protocol (StyleProps.at), and leaves film and stories to advance themselves; `__render.ready` comes from
   fonts.ready, image load events and the first scene, never from timers; `done` 1.5 s (stepped time) after the
   ending scene is told.
Everything else (the cases, the checks, the hand-back, the ports 5660-5679, the prefix r4, the branch `r4`) is R4.md's.
