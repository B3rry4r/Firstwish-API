BUILDER W5b | TIER T2 | Budget 110 steps. The maker's photos under real uploads, and the preview with photos, for every kind.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules; how to wire, measure, check), rulings HT1-HT4, HQ2, HQ3 in
/home/user/Firstwish-API/build/rulings-phase3.md, and the second verifier's file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w5-maker2/round2/VERDICT.md with its
scripts in round2/drv/ (a3.mjs reproduces the two-tabs loss; reproduce BOTH high findings FIRST).
Work: branch `w5-maker2` (7549483) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w5b (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w5b
w5-maker2`; `npm ci`). API for your stack: a detached worktree at the commit in your spawn line, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w5b-api
(its stand-in storage RECEIVES the signed put and its AI answers in shape: drive real uploads through the screens);
run `API_DIR=<your API worktree> npm run contracts:sync` and commit the copied file if it differs; ports 5400-5419;
stack prefix w5b. The branch's typecheck has 2 errors in lib/staff-screens.ts that belong to another bundle: patch
that file LOCALLY to build (version: 0 on lines 106 and 110) and never commit it. Work ONLY inside your worktrees.
You own for this task: the maker's photo step and its upload code (components/app/maker/Photos.tsx, lib/files.ts,
lib/draft.ts), app/w/mine/** and the adaptation of a served wish for the player (lib/engine/adapt.ts fromServed /
fromWish, components/engine/Host.tsx only where it reads the wish). Not the engine's scenes or packages.
Cases:
 1. (high, HT2) Two tabs adding a photo to one draft at the same moment: both photos end in the draft (the add
    re-reads on the server's 409 and adds again, at most a few times), both tabs show both photos within a few
    seconds or on the next read; if one cannot be kept the tile says so in the server's words and can be retried. The
    same for add against remove and add against reorder. Never a photo "ready" in storage that the draft does not
    hold with no word (say what becomes of an orphaned upload).
 2. (high, HT3) /w/mine?id=<draft> never crashes: the celebration (new baby) draft with photos showed "THIS PAGE
    COULDN'T LOAD: Cannot read properties of undefined (reading 'length')": find the cause in the adaptation of the
    served draft; then for EVERY kind (6) and every occasion's pattern the maker offers: a draft with photos and no
    letter, with a letter and no photos, with both, with a screening photo, with a refused photo: /w/mine plays or
    says "Nothing to play yet", exactly as "See it so far" does for the same draft (one function decides both).
 3. A love draft with three photos and a call name plays in /w/mine (it said "Nothing to play yet. Write a letter"
    while the maker's own preview played it).
 4. Small, same files: a voice note saved by the maker plays in the preview after a reload (it sits in
    makerNote.voiceId: map it as the contract means, or list the API request); removing an unconfirmed refused upload
    does not call DELETE on an upload the server never kept (no 404 in the console); a photo over the ticket's limit
    is not left as a "NOT SAVED / Try again" tile: it says the limit in the server's words and goes when dismissed.
 5. With real uploads working, the photo step counts as wired: list maker-photos for the lead's wired.json.
Measure as P6-COMMON says, with REAL uploads (measure file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w5b-measure.txt; pictures
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w5b-pics/: the two tabs after both adds; /w/mine for a celebration draft with photos; for a love draft
with photos and no letter; light and dark at 360). Add your steps to a new flow file scripts/live/flows/w5b.mjs (one
import and one call line in drive.mjs). Checks: typecheck (your files), lint, check:css, `npm run gates` (0 fail, no
new finding), `npm run test:client`, `npm run build`. Commit on w5-maker2; do not push; do not commit wired.json or the
baseline; remove your worktrees, stack and databases; leave no background jobs. Hand back ONCE in 12 lines: head; each
case closed or not with file:line and what you saw; the kinds x states table for /w/mine in the measure file;
REQUESTS; NOT RUN.
