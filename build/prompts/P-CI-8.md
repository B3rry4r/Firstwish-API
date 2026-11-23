PATCH P-CI-8 | TIER T0 (a seed exporter and its one spec) | Budget 25 steps. One failing test; nothing else.
Never pkill, killall or pgrep -f; run ONLY the one spec named here (no full suite); quiet logs ending in an EXIT line.
Read ruling IJ1a (the END of /home/user/Firstwish-API/build/rulings-phase3.md) and GD3, IJ1 there.
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci8 of /home/user/Firstwish-API on a new local branch `p-ci-8`
from claude/sleepy-mayer-f0hkb8 (the head in your spawn line); `npm ci`, `npx prisma generate`; TEST_DB_PREFIX=pci8.
The failure (every local run since the web merged W15C-S1; CI skips it, having no web repo):
src/modules/sample-wishes/tests/ab16-sample-wishes.spec.ts:230, case 3: it deletes prisma/seed-data/SampleWish.json in a copy
and runs scripts/export-seed-data.mjs with WEB_REPO=/home/user/Firstwish-web expecting a first export; the exporter reads
`sampleContent` and `SAMPLE_PHOTOS` from the web's lib/engine/adapt.ts, which no longer has them: exit 1.
Do (IJ1a): in scripts/export-seed-data.mjs the SampleWish table is never written from the web: remove the read of the
web's adapt.ts for it; when SampleWish.json is missing the exporter exits non-zero with words that say the file is
the API's own and to restore it from git, and writes nothing (no empty file); when present it is left alone, as
today (SOURCE.json's note for it stays true: reword "seeded once" only if the words are now wrong). Restate case 3:
(a) file present: a run leaves it byte for byte, whatever the web's files say; (b) file removed: non-zero exit, the
words, no file written; (c) the file holds one row for each kind and occasion of the web's catalogue plus
photographers/your-finals (read the catalogue the way the spec does today). Loosen nothing else; no skip.
Checks: typecheck; `npm run lint`; the spec alone with WEB_REPO as the spec sets it: 0 failed; and once with
`WEB_LIB=/nonexistent/lib` (CI's way): say what runs and what is skipped; `WEB_REPO=/home/user/Firstwish-web node
scripts/export-seed-data.mjs` in your worktree: exit 0 and `git status` shows no change; scripts/gates.sh and
check-drift. Commit on p-ci-8; do not push; remove your worktree. Hand back ONCE in 6 lines.
