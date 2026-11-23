VERIFIER API-BASE-16 | TIER T1, lean (public reference data) | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-16/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-16.md (its cases are the contract) and ruling IJ1 in
build/rulings-phase3.md. Under test: /home/user/Firstwish-API local branch `api-base-16` (head 93166e9) against its base bad3a54. Your own
detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab16 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab16. Probes as
specs under the verify folder.
The builder's claims: E-287 GET /v1/sample-wishes (?kind=) and E-288 GET /v1/sample-wishes/:kind/:occasion; a
table sample_wish (migration 20261207090000_sample_wish_ab16) with 44 rows seeded once from the web's source and
owned by the API after; the answer has kind, occasion, occasionName, receiverName, call, date, opensAt, state,
openable, content, files, photos, sample:true; the headers of the public styles read; a sample is never a wish
(no slug, owner or link; 404 on every public wish route); DEC-309 to DEC-311; 1557 passed.
Check (each PASS or FAIL with what you saw):
 1. The shape is what a player needs: compare E-288's answer field by field with what the public wish read (E-129)
    gives for a real showing wish of the same kind (make one): every field a player reads from E-129 is in the
    sample with the same type and meaning, or say which is missing or differs; `sample: true` is there; nothing
    private or server-only is in it (ids, storage keys, timestamps of rows).
 2. The 44: every kind by occasion in the catalogue (the seed's own tables) has a sample; each sample's words equal
    the web's source for it (/home/user/Firstwish-web/lib/engine/adapt.ts sampleContent for that kind and occasion: script the
    comparison through the web file if you can import it, else compare 8 by hand across all six kinds); the
    photos are the site's own picture paths and each exists under /home/user/Firstwish-web/public.
 3. Unknown kind, unknown occasion, a kind in upper case, a path with dots or slashes, a 300-character occasion:
    404 or 422 in words, never 500; the list with an unknown kind: say what it answers.
 4. Owned by the API: run the exporter with the web present twice: prisma/seed-data/SampleWish.json does not
    change; change a sample's words in a COPY of the web's file (never the real repo) and export with WEB_REPO
    pointing at the copy: the seed file still does not change; the seed twice: no change; CI's way
    (`WEB_LIB=/nonexistent/lib`) still passes the reference-data spec.
 5. Never a wish: the sample's row id through every public wish route and through the owner's wish routes as a
    signed-in person: 404; it is in no list, count or Now Showing; a POST that tries to write into a sample
    stores nothing.
 6. The migration: up on a base-shaped database, twice identical through the seed; a way back; the registry:
    additive only, the two new ids, older ids unchanged, ui-align-tasks.json byte for byte; typecheck, the WHOLE
    `npm run lint`, gates.sh, check-contracts, check-drift, check-routes exit 0; `WEB_LIB=/nonexistent/lib npm
    test -- --maxWorkers=2` once: totals.
Write VERDICT.md in the verify folder (25 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktree and databases. Hand back ONCE in 12 lines or fewer.
