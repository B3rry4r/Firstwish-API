VERIFIER P-API-BASE-11B (re-check of a patch) | TIER T2 (it erases; it shows people's things in public) | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab11b/round2/NOTES.md (if it exists an earlier verifier was lost: read it and carry on).
Read ruling IF4a (and IF4, IF6, IC4) in /home/user/Firstwish-API/build/rulings-phase3.md and the first check's notes and probes in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab11b/ (reuse the probes).
Under test: /home/user/Firstwish-API local branch `api-base-11b` (head in your spawn line; the patch is the commits after 3ac9352). Your own
detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab11b2 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab11b2. Run
every command with your own worktree as the working directory. Remove your worktree and databases when done.
Re-check ONLY these, through the real routes and the real jobs (each PASS or FAIL with what you saw):
 F1 (was HIGH): erase an ACCOUNT that owns three wishes with friends' voices (one live, one removed, one sealed):
    after the real erase and its jobs: no wish_gather_voice row, no voice_note row, no stored_file row and no
    stored object of those voices (list the stand-in store before and after); another account's voices, and a
    voice the erased person gave as a FRIEND to someone else's wish (what should happen to it? say what does),
    untouched or as the erase rules say. Run it twice; a job that fails half way and is retried leaves nothing.
 F2 (was MEDIUM): a creator's public reads (E-283 wishes, E-285 styles, and E-236 the profile) after: the creator
    is erased and another creator takes the handle; the creator renames their handle; two creators swap handles;
    a creator is suspended then restored: never one person's styles or wishes under another's handle; old data
    whose style.creator JSON has a handle but no creatorId (make such rows by SQL as the base wrote them): listed
    under the right account or not at all, never under the wrong one.
 F3: a wish tied to an undelivered Concierge order with a published row made by SQL: in none of the four public
    reads; after delivery it is listed only if the BUYER published it (a row made before delivery must not make
    it public by itself: say what you see).
 F4 (IF4a): removed + an open report at the day: not erased; dismissed after the day: erased at once; dismissed
    before: erased at the day; upheld: stays, restore refused; two reports (one dismissed, one open): waits; a
    report opened AFTER the erase was scheduled but before the day: waits.
 Also: the first check's passes still hold for the single-wish erase (run its 30 restore-vs-job pairs once);
 check-contracts, check-drift, check-routes, gates.sh, typecheck EXIT 0; the full suite ONCE
 (`WEB_LIB=/nonexistent/lib npm test`).
Hand back ONCE in at most 15 lines: verdict (merge / fix first), each F with PASS or FAIL and file:line, new findings by severity.
