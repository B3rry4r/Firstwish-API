PATCH API-BASE-22 round 1 | TIER T2 (people's photos) | Budget 45 steps. Close the named findings of the check. Nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2`; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves.
Read /home/user/Firstwish-API/build/common-rules.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-22/VERDICT.md (the findings; its probe
scripts are beside it: reuse them). Work: the local branch `api-base-22` (head 5eddf1f) of /home/user/Firstwish-API, in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab22 (`git worktree add <path> api-base-22`, `npm ci`, `npx prisma generate`); TEST_DB_PREFIX=pab22.
Do not edit a gate or a baseline; no wire change; no registry reopen; no older test's expectation changed (name any you must).
Cases (a test for each; FIRST show it failing on 5eddf1f):
 M1. A photo erased while its sizing job runs leaves NO object behind: erase between w320 and w768 (and after the
     last write, before the row is saved): afterwards the storage holds nothing under that file's keys. Close it at
     both ends: the job, before it saves, sees the row is gone and deletes what it wrote; and the erase deletes
     every sized key the rules can name (all IMAGE_WIDTHS), not only those listed in the row.
 L3. The source is read from storage ONCE for a photo's three sizes (count the reads in the test), not once a size.
 L4. readObject on the real S3 adapter stops reading once maxBytes is passed even when the store sends no
     ContentLength (count bytes on the stream; refuse with the same words); a test with a stub stream.
(L2, the SVG branch in the adapter, goes to the sweep list: do not touch it.)
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the ports and
stored-files folders' specs (the ab21-clips pair is known to fail beside them, on the base too: say its count, do
not chase it); do NOT run the full suite. Commit on api-base-22; do not push; remove your worktree; drop your
databases. Hand back ONCE in 8 lines: head; M1, L3, L4 each with its test name and before/after; the lines changed.
