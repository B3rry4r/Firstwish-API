VERIFIER W7 | TIER T2 full, measured in a browser on a real API stack | Budget 110 steps. Machine: 4 CPUs, 15 GB; a heavy
job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it; the builder's brief is /home/user/Firstwish-API/build/prompts/W7.md;
rulings HA1, HA2, NN1, NN6 in /home/user/Firstwish-API/build/rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `w7-receiver` (head in your spawn line). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w7-receiver (web)
and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w7-receiver-api (API); stack prefix vw7; ports 5440-5459; verify folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w7-receiver/ (pictures in shots/). The stack can move time: STANDIN_CLOCK_OFFSET (seconds, read
at boot; restart the API with a new value) reaches "opens", "resting" and "ended" the real way.
Besides the common list, attack (the receiver is a stranger on a phone with only a link):
 - No content before its time or without its passcode: for a wish not yet open, a passcode wish, a question wish,
   a resting, ended, removed, taken-down and erased wish: read EVERY network answer the page gets (the link read, any
   script chunk, any image url) and the page's HTML: no name of the sender beyond what the design shows, no chapter,
   photo url, voice url or letter. At the open time (move the clock or wait): content comes only after POST opens.
 - Passcode: 9 wrong then the right one (opens); 10 wrong then the right one (locked: the server's words, the
   button held); the lock after an hour (move the clock); from a second browser profile while locked (NN6 says the
   link locks for everyone: is that what the screen says?); the unlock token: in no store, no URL, gone on reload.
 - The player with real content (make a wish through the API with a cover, three photos by upload ids and a letter;
   say what the stand-in storage lets you show): photos and voices come from signed urls (no id-only tile, no sample);
   reactions: one request per tap, the server's count; a reaction after a reload.
 - Samples: the builder deleted WishPlayer.tsx and the style demo with sample words: grep the branch for any sample
   photo, name or text still reachable at /w/<anything> or /w/mine; "Watch it play" links on the website's style pages
   now reach the 404 state (HALT 2): confirm, and name every link in the web that now leads to that 404.
 - /w/mine?id=: the owner's draft plays what the server holds (after W4/W5's saves); another person's id; a sealed
   wish's id; no id; signed out. Seal.tsx shares /w/mine?id= as the receiver link (the builder says): confirm what
   link a maker is told to send today and whether a stranger can open it.
 - The menu: Share copies the server's link; Make one like this lands in the maker with kind, occasion and style;
   Report writes a row the staff Moderation screen then shows (read the API).
 - The builder's HALT 1 (keep and wake by link cannot be drawn: the public view has no id the keep and wake routes
   take; a resting wish's link is 410): confirm from the API; is anything about keep or wake still DRAWN at the link
   (a dead control), and what does a receiver of a resting wish see?
 - lib/api.ts: the builder added a `headers` option (3 lines) though the file is import-only for it: read the diff;
   does it weaken anything (can a caller overwrite Authorization or the Idempotency-Key)?
