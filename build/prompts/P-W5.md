PATCH P-W5 | TIER T2 | Budget 110 steps. Close the verifier's findings on the maker's content screens; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules; how to wire, measure, check), /home/user/Firstwish-API/build/prompts/W5.md, rulings HQ2,
HQ5, HP3 in /home/user/Firstwish-API/build/rulings-phase3.md, and the verifier's file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w5-maker2/VERDICT.md
(look at its picture shots/peek-after-reload.png).
Work: branch `w5-maker2` (6394795) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w5. FIRST merge the web
branch head (commit in your spawn line: it holds the receiver's screens with /w/mine reading the server's draft, the
staff screens, and the person's app) into w5-maker2 with a merge commit (no rebase), keeping both sides' work; then
`npm ci` and `API_DIR=<your API worktree> npm run contracts:sync` if the contract file differs (commit it). API for
your stack: a detached worktree at the commit in your spawn line, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w5-api (it gives the owner's
`pictures` with signed urls on the wish read); ports 5400-5419; stack prefix pw5. Work ONLY inside your worktrees.
 H1 (high, HQ2) No sample ever plays as the person's own: "See it so far" (lib/maker.ts preview, lib/engine/adapt.ts
    fill) and every other preview of a real draft show ONLY what the draft holds: its photos by the server's signed
    urls (the wish read's `pictures`; a url refetched when expired, never stored), its words; a part not yet made
    shows the designed empty state or is left out, never /img/aisha-*.webp or sample words. Where a sample is a
    legitimate demo (the website's style pages, the Studio) it stays; say exactly which calls still pass fill:true and
    why each is not a person's wish. The fake_data baseline entries this clears: list their ids (do not edit the
    baseline).
 H2 (high) /w/mine?id=<the draft> opens the server's draft from the maker's "See it so far" and "Watch" (after the
    merge the page reads the server: prove it end to end from the maker, signed in, after a reload).
 M1 lib/reference.ts keys openings by lock, and the server has two with lock "secret" (question and passcode), so
    both tiles show the same words: key by the server's id or slug; each tile shows its own name and line.
 M2 After a reload a photo the server holds shows its picture (the signed url); while it is being screened the tile
    says so in the server's words; a refused photo shows the server's reason and can be removed.
 M3 A style the wish's ticket does not allow: draw what the server says. Today the API accepts any style on a draft
    (ruling HQ5: the server's rule is being built): do not invent a client rule; remove any that exists in the maker's
    style step (lib/levels.ts use there) only if the screen then still shows each style's level from the server; list
    under REQUESTS what the style step needs from the API.
 L1 .fm-ai-open and .fm-state get hover and focus-visible; an empty moment list says so in words.
Measure and check as P6-COMMON says (measure file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w5-measure.txt; pictures /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w5-pics/:
"See it so far" after a reload with the person's own photos; an empty draft's preview; the two opening tiles; a
screening and a refused photo tile; light and dark at 360). Commit on w5-maker2; do not push; do not commit wired.json
or the baseline; remove your worktrees, stack and databases; leave no background jobs. Hand back ONCE in 12 lines:
head; H1, H2, M1-M3, L1 closed or not with file:line and what you saw; stale baseline ids; REQUESTS; NOT RUN.
