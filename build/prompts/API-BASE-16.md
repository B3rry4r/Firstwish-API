BUILDER API-BASE-16 | TIER T1 (public reference data; no money, no identity) | Budget 90 steps. The designed sample wishes that style previews play become the server's reference data; change nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; a commit at every closed case; never
pkill, killall or pgrep -f (stop only PIDs you started); final runs in the FOREGROUND. If the branch, worktree or
a NOTES.md already exists, an earlier agent was lost: read git log and carry on.
Read /home/user/Firstwish-API/build/common-rules.md, rulings IJ1, R10, HU5 in build/rulings.md and build/rulings-phase3.md, the plan
build/tasks/W15C-PLAN.md (bundle S1), how the styles' seed is exported from the web and then OWNED by the API
(scripts/export-seed-data.mjs, prisma/seed-data/, the reference-data module and its GD3 test), and how
API-BASE-11A reopened the registry (ONE reopen, additive only, ids unchanged, `.pipeline/ui-align-tasks.json`
byte for byte, decisions citing IJ1).
The source today: /home/user/Firstwish-web/lib/engine/adapt.ts (`sampleContent(kind, occasion)` gives {call, name, date, content};
`sampleWish(kind, occasion, photos)` builds the wish a preview plays; `SAMPLE_PHOTOS` are the site's own pictures
/img/aisha-N.webp) and the kinds and occasions in /home/user/Firstwish-web/lib/catalog.ts.
Work: /home/user/Firstwish-API, local branch `api-base-16` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-16 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab16. Run every command with
your own worktree as the working directory. Do not edit a gate or a baseline.
Cases (a test for each):
 1. A public read of ONE sample wish: GET /v1/sample-wishes/:kind/:occasion answers the designed sample for that
    kind and occasion in the same shape the public wish read gives a player (so a preview plays it with no second
    code path): the words, the names, the date (a date already past, said as the source says it), the photos as
    the site's own picture paths, and a mark that it is a sample; an unknown kind or occasion: 404 in words;
    cacheable as the other reference reads are (the same headers as the public styles read).
 2. A list read for what the previews need at once: GET /v1/sample-wishes?kind= answers the samples of a kind
    (all kinds when none is named), small enough for a page of tiles (say its size).
 3. The data: a table of sample wishes seeded from the web's source through the exporter ONCE (every kind by
    occasion the catalogue has: say the count), then owned by the API: a later change in the web's file does not
    change the seed (as the styles' `get` line); the seed runs twice with no change; the GD3 test covers it.
 4. A sample is never a real wish: it has no slug, no owner, no link, is in no wish list, no count, no report,
    no Now Showing; nothing a person types is ever stored in it; a test that walks the public wish routes with a
    sample's id and gets 404.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, scripts/gates.sh, check-contracts,
check-drift, check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0
failed. Commit on api-base-16; do not push; remove your worktree and databases; leave no background jobs. Hand
back ONCE in 10 lines: head; each case closed or not with the test's name; new endpoint and decision ids; the
count of samples; totals; what you could not do.
