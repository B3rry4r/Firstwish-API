PATCH join 6 fix | TIER T2 | Budget 70 steps. Close the named rulings only; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, rulings HC1, HD1, HD3, RR3, ZB4, ZB5 in
build/rulings-phase3.md, and the verifier's file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/join6/VERDICT.md (its specs are *.spec.ts.txt in the same folder:
read them to reproduce each finding first).
Work: commit on top of local branch `p-join6` (22f7dbe) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join6b (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join6b p-join6`; `npm ci`); ports 5020-5029; TEST_DB_PREFIX=pjoin6b. You may touch src/modules/** only. HD2 is NOT
yours (it needs a column).
 HD1  a login's own erase blanks their contact in every login row; test scans every table for the email and name.
 HC1  after an owner's erase, the Vault files a reveal still shows (the chosen files of a shoot whose reveal link is on and
      whose term has not ended) are kept by the owner's file job and removed when that reveal's term ends, with the
      reveal's words; a file no playing reveal shows is removed at once as before. Tests through the real routes: the
      reveal plays with its photos after the erase (read a signed address and fetch it from the stand-in storage); at the
      end of the term the stored file and its row are gone; a file shared by a playing reveal and a deleted shoot stays.
 HD3  (a) the login check for E-30, E-32 and the usePlan seal runs after the business owner's lock is taken: 20 wishes made
      and 10 usePlan seals in flight while the login is removed: every wish made is the owner's, none is readable by the
      removed login, counts and draws stay exact. (b) Reproduce the 500 on POST /v1/business/client-wishes under 20 at once
      (run it 40 times): name the cause with file:line and fix it; the route answers only 201, 402, 403, 409 or 429.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, `npm test` (--maxWorkers=2)
twice (name any failing test). Commit on p-join6 (do not push); remove your worktree and databases. Hand back in 8 lines:
the new head; each id closed or not with file:line and the test's name; the cause of the 500.
