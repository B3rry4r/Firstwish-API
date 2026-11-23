VERIFIER W15C-S1 | TIER T1, lean (previews and hints read the server's samples) | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w15c-s1/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, W15C-S1.md (same folder: its cases are the contract) and ruling IJ1 in
/home/user/Firstwish-API/build/rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `w15c-s1` (head d1a5844) against its base b3f1844. Your own detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws1 (the branch) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws1-base (the base) (`npm ci` each), and an API
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws1-api at the API commit in your spawn line; ports 5780-5799; stack prefix vws1; BUILT.
The builder's claims: sampleWish, sampleContent, SAMPLE_PHOTOS and the web's sample-words tables are gone from
lib/engine/adapt.ts; lib/samples.ts reads E-287/E-288 (memory only); Preview, the Studio's Live, Start, Editor and
mount, and the style lab play the server's sample; a creator style's public page plays the sample for its kind
with a preview caption; the maker's hints are the server's words (empty before they arrive and when the read
fails); CategoryPage.tsx was NOT changed (it plays no sample); gate accepted 316 -> 289 (27 gone), 0 new; ws1.mjs
20 checks and wa7c 96, 0 FAIL twice; the whole driver NOT run; KNOWN GAP: the server has no sample for
photographers/your-finals (the web has that recipe in lib/occasions.ts), so that one shows the read-failed
state; lib/wish-model.ts still holds an unused SAMPLES table.
Check in a real browser at 360 first (each PASS or FAIL with what you saw):
 1. What a person sees is the same as before: for EVERY kind by occasion the web has a recipe for (lib/occasions.ts:
    all of them, not six), compare on the base (the web's sample) and on the branch (the server's): the words,
    names, date and photos a preview draws (script it through the page or through the two builds' own functions;
    list every difference and every recipe with no server sample).
 2. Where a sample is played: an unrecorded house style's tile and page (find one or make one unrecorded by
    removing its recording in YOUR worktree only), the Studio's Start, Editor and Live preview, a creator style's
    public page, the style lab: each plays the server's sample; while it is read: what is drawn (no empty or
    broken frame, no layout jump at 360); the read failed (500, offline): the words and Try again where the
    screen has them; the tile's dark frame: is that a state a person would read as broken? (say).
 3. The maker's hints: for three kinds, the hint in each field equals the server's sample words; with the read
    held: no hint (and the field's label still says what to type); failed: no hint, no error box in the way.
 4. Requests: one list read per page of tiles (count them on /styles and in the maker's style step); nothing in
    browser storage (R10); no request to a creator-only route from a signed-out page.
 5. The gate: `python3 scripts/gates/run.py --json` base and branch: fail 0; accepted 316 then 289; the 27 gone are
    the builder's list; 0 new; scripts/gates, the baseline, wired.json and tsconfig.json untouched. grep the
    branch for any sample person's name, a sample photo path or a sample table left in app/, components/ or lib/
    (lib/wish-model.ts SAMPLES: who imports it; is it dead).
 6. typecheck, test:client, check:css, build exit 0; ws1.mjs, wa7c.mjs, w10.mjs, w5-maker2.mjs alone: totals; the
    whole driver ONCE on a fresh stack to the end (over 4500 s): totals; a FAIL: rerun that flow alone twice.
Write VERDICT.md in the verify folder (30 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees, stack and databases. Hand back ONCE in 15 lines or fewer.
