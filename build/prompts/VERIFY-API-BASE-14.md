VERIFIER API-BASE-14 | TIER T2 (whose file a style may name; a rule that can refuse every save), full | Budget 80 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-14/NOTES.md as you go (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-14.md (its cases are the contract), rulings II4, II5, HX4 in
build/rulings-phase3.md. Under test: /home/user/Firstwish-API local branch `api-base-14` (head 6e02fe9) against its base a590870. Your own
detached worktree .../build/wt/v-ab14 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab14. Probes
as specs under the verify folder (not in the repo).
The builder's claims: every place a document names a file is found by ONE function (fileRefsOf in
src/modules/studio/submission-checks.ts): an art item's fileId (and id when a uuid), the poster's fileId, id and
src, the sound, a scene's backdrop (also the "*" scene), an added thing's `what` when its kind is artwork or model,
and its fill.art; a save (PATCH) and a send-in naming a file that is not this style's, not the caller's, held,
refused, removed, kept, no file or a non-id is 422 in words naming the place, nothing saved; another creator's
file reads like an unknown id; a removed or kept file is stripped from the creator's draft inside the save's
account lock; a poster `src` that is a URL is now 422; II4 keeps a poster, sound, model, scene picture and
artwork that approved version 1 names; E-196 carries no creatorId after an erase; one older test changed
(studio.contract.spec.ts "a file over its size fails the safe check"); 1512 passed.
Attack through the real routes, in this order (each PASS or FAIL with what you saw):
 1. DOES THE RULE REFUSE AN HONEST SAVE? (a refusal of every save is a BLOCKER). The web builds the document:
    read /home/user/Firstwish-web/lib/studio.ts (the Style type about lines 300-530: `art` items with an `id` the web makes itself
    and a `fileId` from an upload; `sound`, a scene's `backdrop`, an added thing's `what` and `fill.art` hold an
    ART ITEM's id, not a file id; things added from the house banks have other kinds; `poster` is `{frame}` and
    more) and what its live flows send (scripts/live/flows/w10.mjs, wa7.mjs on the web branch `web-api-7`: read
    them in `git show web-api-7:<path>`). Build, as specs, the documents those screens save: a blank new style; a
    style from a house template (`from`); every tool's output you can find (text, shapes, a bank element, a bank
    opening and ending, a moment, a gradient ground, a texture); an uploaded picture placed as artwork, as a
    backdrop, as a fill, as the poster; an uploaded sound; an uploaded model; an art item with an id and NO
    fileId (an older shape); a poster with `src` as the web writes it today (find what it writes: a URL, a data
    address, an art id?). Each must save and send in on the head exactly as on the base; list every one the head
    refuses that the base accepted, with the body.
 2. The refusals: for EACH place in the claim, another creator's ready file, another creator's unconfirmed file,
    the caller's file of another style, a held file, a refused file, a removed file, a kept file, a random uuid, a
    non-id: 422 with the place in words and nothing saved (read the row after); the words never say whether
    another creator's file exists. The same through the send-in. A style saved on the BASE with such a name: it
    still reads, its send-in is refused in words, and a save that leaves the bad name untouched while changing
    something else: what happens (can the creator still fix it?).
 3. The strip on removal: a creator deletes a file their draft names in three places: the draft after it (no name
    left, nothing else lost); a style in review or live is untouched (its document is frozen); 30 parallel saves
    against the removal: the saved document never names a gone file; no deadlock, no 500; another creator's draft
    is never touched.
 4. II4 for every kind: version 1 names a poster, a sound, a model, a backdrop, an artwork; the creator deletes
    all five; version 2 approved: a version 1 wish still gets all five at its link with addresses; the sweep run
    twice takes none.
 5. E-196 after an erase: no creatorId anywhere in the body; the public lists the builder left alone: what they
    carry for an erased creator (report, do not fail).
 6. The older test changed follows II5 and loosens nothing. typecheck, the WHOLE `npm run lint`, gates.sh,
    check-contracts, check-drift, check-routes exit 0; `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2`
    once: totals.
 7. LAST, and ONLY if the file .../build/verify/api-base-14/BROWSER-SLOT-FREE exists when you reach this step (if
    it does not, say "step 7 NOT RUN" and hand back): the real screens against this API: a web worktree
    .../build/wt/v-ab14-web of /home/user/Firstwish-web at branch `web-api-7` (`npm ci`), read
    /home/user/Firstwish-API/build/prompts/P6-COMMON.md for the stack, ports 5740-5759, stack prefix vab14, BUILT, with YOUR API
    worktree; run scripts/live/flows/w10.mjs and wa7.mjs alone: totals; any save refused by the new rule is the
    BLOCKER of step 1 seen for real. Stack down, worktree removed.
Write VERDICT.md in the verify folder (40 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees and databases; leave no jobs. Hand back ONCE in 20 lines or fewer.
