VERIFIER B06 | TIER T2 full | Budget 95 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B06.md (the cases are the contract),
.pipeline/conventions.md, .pipeline/declared/wish-lifecycle.json and jobs.json (by python: the rules and limits), ruling R10.
Under test: local branch `b06-wish-core` (head 00b4a31) of /home/user/Firstwish-API; base local branch int-2 (d8c1c3c). Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b06 (detached at the branch; `npm ci`); ports 4450-4459; database prefix vb06; remove both when done; kill by PID.
Endpoints: E-221..E-225, E-227, E-229..E-231 (`python3 tools/pipeline/show.py endpoint E-225`). Attack with your OWN scripts (the
stack for plain HTTP; createTestApp with the clock port for time).
Known and NOT findings (rulings CC1-CC6 in build/rulings-phase3.md): the PATCH and seal bodies use the builder's own DTO; PATCH
answers 204 with an ETag; the content size limit is an env value; E-226, E-232, E-228, admin wishes and admin jobs are not built;
the send-notice job has no handler yet; jobs use an advisory lock where a unique index is ruled.
CLAIMS: each numbered line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b06/CLAIMS.md: PASS or FAIL with what you saw.
Attacks (the wish is the product: spend your steps here):
 - The phone's clock is never trusted: can any request make a wish open early, stay sealed, or change its term (a body field, a
   header, an opensAt in the past, a zone that does not exist, the day the clocks change in Europe/London, a seal one second
   before its open time)? Two jobs for the same wish due at once. A job that runs late (clock jumps a week): states end right.
 - The sealed content: after seal, can anything change what the receiver will see (PATCH, add photos, replace a file's bytes,
   delete a file, change the style, the names, the opening or ending)? List what can and cannot change, against the brief.
 - Paid or not: every way to seal without a fulfilled ticket (a ticket in the PATCH or POST body, a negative version, sealing
   another's paid wish, fulfilTicket reachable from any route). Starter limits: one photo over, one voice over, 100 files at once.
 - The number and link: 50 seals at once: numbers gapless and unique; a seal that fails (a thrown error after the number is taken):
   is there a gap? (say); the slug's randomness (length, alphabet); the passcode: hashed, never returned, constant-time compare.
 - Ownership: with account B's token every route with A's wish ids; a business login sees only its business's wishes; a removed
   login sees none. An erased account's wishes: gone from lists, links dead.
 - Stale writes: 20 PATCHes at once with one version (one winner, 19 x 409, content intact, not a merge of two); a 1 MB content.
 - The state machine: every illegal move (seal twice, open a draft, restore a live wish, erase a draft, restore after erase);
   each legal move writes exactly one transition; take down while its open job runs (race, 10 times).
 - Jobs: two workers, 200 due jobs: each runs once; a handler that throws 5 times is parked and stops; a handler that hangs
   (never returns): what happens to the job and the worker? (a stuck job that blocks the queue is HIGH); retryParked by a user (403).
 - Erase of a wish: search the database for its words, names and file ids afterwards; the row, number and kind remain.
 - Errors: the envelope; no 500 for a non-uuid id, a bad cursor, a huge body, a NUL byte.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/wishes src/modules/jobs` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b06/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
