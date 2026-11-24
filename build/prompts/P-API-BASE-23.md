PATCH API-BASE-23 round 1 | TIER T2 (people's photos) | Budget 45 steps. Close the two named findings of the check and the flake beside them. Nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2` and TEST_DB_PREFIX=pab23 on EVERY test command; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in
/home/user/Firstwish-API or /home/user/Firstwish-web themselves; no single command over 8 minutes.
Read /home/user/Firstwish-API/build/common-rules.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-23/VERDICT.md and NOTES.md.
Work: the local branch `api-base-23` (head 05ca199) of /home/user/Firstwish-API in your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab23
(`git worktree add <path> api-base-23`, `npm ci`, `npx prisma generate`). Do not edit a gate or a baseline; no wire change; no registry reopen; no
older test's expectation changed (name any you must).
Cases (a test for each; FIRST show it failing on 05ca199):
 M1. stored-files.service.ts ~405-411: an image clean that fails because the SERVER could not do it (the port's
     time limit, storage down, out of memory) is not the uploader's fault: the confirm answers 503 with words, the
     upload is KEPT (still unconfirmed, never readable by anyone, reaped by the sweep if never retried) and a
     second confirm succeeds; only a picture that cannot be opened is refused (422) and deleted. The same split
     the media branch already makes.
 M2. photo-cleaner.ts cleanStored ~46-55: an erase between the read and the put leaves NO object under the erased
     file's keys (re-check the row after the put and remove what was written; the same rule round 22 made for the
     sized copies: reuse it). The same moment for the media clean of a stored voice or clip.
 F.  The check saw ab22-r1-race "M1" fail once in three folder runs with a confirm answering 422: find out whether
     that is M1 above (a slow clean under load turned into a refusal) or something else: run the stored-files
     folder five times at 2 workers after your fix: say the totals; if it still fails, say what you found, do not hide it.
(The lows go to the sweep list: do not touch them.)
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
stored-files and wishes folders. Do NOT run the full suite (if your session refuses a command, do not retry and ask
nobody: say NOT RUN). Commit on api-base-23; do not push; remove your worktree; drop your databases. Hand back
ONCE in 8 lines: head; M1, M2, F each with its test and before/after; the source lines changed (count).
