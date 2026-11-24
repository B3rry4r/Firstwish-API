VERIFIER R4C | TIER T2 (the render page for every style; 16 style files edited) | Budget 85 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND where it fits 8 minutes (else in the background with a log, waiting in loops of 230 s or less), only when `free -g`
shows 6 GB or more; never pkill, killall or pgrep -f (stop only PIDs you started); never edit, build, checkout or reset anything in /home/user/Firstwish-web or
/home/user/Firstwish-API themselves; no `rm -rf` inside a loop; notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4c/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/R4C.md (the contract); rulings IK8, IK6a, IK6b, IK6f (the END of /home/user/Firstwish-API/build/rulings-phase3.md); the builder's table
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/r4c-out/final-cases.txt.
Under test: the MERGE of the web's local branch `r4c` (a770810, from 88bcd46) onto the web head 2f1cdc8 (which has a NEW stepped clock: an error thrown
in a stepped timer or frame callback is now a page error). Make it in your own detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r4c
(`git worktree add --detach <path> 2f1cdc8`, then `git merge --no-commit r4c` there; commit nothing), `npm ci`; a base worktree .../build/wt/v-r4c-base at
2f1cdc8 for comparisons; the API at 1b8ac63 in .../build/wt/v-r4c-api (`npm ci`, `npx prisma generate`); FIRST `API_DIR=<it> npm run contracts:check`
(exit 0). Stack by scripts/live/stack.mjs (name vr4c, ports 5340-5359, TEST_DB_PREFIX=vr4c), BUILT.
The builder's claims: 43 house styles, 95 cases (every ending), 95 done and clean (0 focusable, 0 button or link roles, 0 action words) at a 200 ms
step; the "stuck" styles were only slow (WebGL frames cost 1 s or more here); 15 cues wrapped in Hint or Hush in 16 style files (wrapper-only: the
same element when not rendering); a word list that also reads every Hint and Hush string; a voice wish plays no sound under the render page; a
receiver's view is identical on 32 of 32 compared pairs; checks green. NOT run by it: the 33 ms step; the receiver compare on endings it did not edit.
Attack (a control, a cue or an action word in a recorded frame, a style that never ends, or a receiver who lost a cue, is HIGH):
 1. The sweep on the merged tree: all 43 styles with their first ending and 15 other endings you pick (say which) at
    the 200 ms step; and SIX cases at the true 33 ms step (a scroll, a film, a stories, a swipe, a stage and one WebGL
    style): done, clean, page errors (the new clock raises timer errors: ANY page error is a finding, with its
    words), stepped and real seconds, seconds a frame.
 2. LOOK: for 12 styles (the 16 edited files first), capture the render page at 1080 x 1920 at five moments each
    (opening, two middle scenes, the ending's start, the last frame) and look at every picture: a hint, a chevron
    or arrow that invites a touch, a button shape, a cursor, a progress pip that only makes sense to a person
    holding a phone, an empty gap where a cue was. The word list cannot see pictures: you can. Keep the pictures.
 3. The receiver did not lose anything: for each of the 16 edited files, on /w at 360 and 1440, base against
    merge: the cue's words are STILL shown to a real receiver at the same moment, in the same place (a picture pair
    and the element's box), and its control still works (the state after the press, by aria or text). Six endings
    the builder did not edit: unchanged.
 4. Length (IK6b): from the sweep, each style's opening + ending and whole play in stepped seconds: the five longest
    of each; is any opening + ending over 60 s? The WebGL styles: seconds a frame at 33 ms, and the minutes a 60 s
    video would take here (a release risk: numbers only).
 5. The word list's limit: in a scratch copy (never committed) add one unwrapped cue with a word outside the seed:
    does the sweep catch it? Say plainly what the sweep cannot see.
 6. `npx tsc --noEmit`; `npm run lint`; `npm run gates` (0 new); `npm run test:client`; `npm run check:css`; the diff's
    file list: only the files the brief lets it own; nothing under public/, no tsconfig, no gate file.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4c/VERDICT.md (30 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line and the picture's name. Stop the stack and servers by PID; remove your three worktrees; drop your databases. Hand back ONCE in 14 lines.
