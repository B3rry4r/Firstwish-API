VERIFIER API-BASE-22 round 2 | TIER T2, re-check of three named findings only | Budget 20 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2`; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves.
Read /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-22/VERDICT.md (round 1; its probe scripts are beside it) and
`git diff 5eddf1f c3b861c` (7 files, +186/-13). Under test: local branch `api-base-22` head c3b861c of /home/user/Firstwish-API, in your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-ab22 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=v2ab22 (set it on EVERY test command).
The patch's claims: M1 the sizing job re-checks the row after each write and removes what it wrote; the erase deletes every sized key the rules
name, before and after the row goes; L3 the source is read once for the three sizes; L4 the S3 read counts bytes on the stream and stops past
maxBytes when no ContentLength is sent.
 1. M1 with YOUR probe from round 1 (erase between w320 and w768), and two more moments: the erase lands while a
    resize is being written (after the row check, before the write ends), and the erase runs twice at once.
    After each: nothing under the file's keys. Is there any order left in which a copy survives? (Say it, with the order.)
 2. L3: one read for three sizes; the source buffer is not kept after the job (memory before and after 20 photos).
 3. L4: read the new loop: a stream of 3 chunks passing the limit stops and is destroyed; within the limit the bytes are whole and in order.
 4. Did the patch break round 1's passes? Rerun your metadata and hostile-file probes once.
 5. typecheck; the WHOLE lint; scripts/gates.sh; the ports and stored-files folders' specs (the ab21-clips pair is known to fail beside them: say its count only).
Verdict appended to the same VERDICT.md under "Round 2" (12 lines or fewer): MERGE or FIX FIRST. Drop your databases, remove your worktree. Hand back ONCE in 8 lines.
