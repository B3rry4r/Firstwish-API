VERIFIER P-B06 | TIER T2, re-check by ruling id | Budget 75 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B06.md, rulings EE1-EE9, CC1-CC6, BB6 in build/rulings-phase3.md,
product truths T-44, T-45 (python: .pipeline/product-truths.json), and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b06/VERDICT.md (round 1).
Under test: local branch `p-b06` (head e83c527) of /home/user/Firstwish-API; base local branch int-3 (c4fef88). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b06 (detached at the branch; `npm ci`); ports 4560-4569; TEST_DB_PREFIX=vpb06 for every run; remove both when done; kill by PID.
With your OWN scripts on createTestApp and the clock port (the stack for plain HTTP), say CLOSED or OPEN for each:
 EE7, the term (the most important): seal a paid wish for tomorrow 09:00 Lagos. Before the open time: not openable, no endsAt.
   At the open time: openable, still sealed, NO endsAt, no term running. Wait 10 days (clock), then call lifecycle.markOpened:
   openedAt = that moment, state live, endsAt = openedAt + the ticket's term (7, 14, 30, 60 days: try each ticket), a rest job
   at endsAt. markOpened 20 times at once and again a day later: openedAt never changes (also try an UPDATE in psql: refused).
   At endsAt the wish rests. markOpened before the open time is refused. markOpened on a resting, removed or erased wish is refused.
 EE8: a wedding wish with a wedding date in 20 days, opened today: endsAt = the wedding date (00:00 in its zone) + the term;
   opened AFTER the wedding date: what is endsAt? (say; it must never be in the past at the moment of opening without resting).
 EE9: sealed and never opened: 365 days after its open time it rests; opened on day 364: the term runs from that opening.
 EE1: one handler that never returns + 199 normal jobs, one worker: all 199 run, the stuck one is failed (timeout), retried,
   parked after its tries; the tick keeps running; a handler that returns AFTER its limit does not get counted as a success
   twice or run its effects twice (say what the code does about a late finish).
 EE3: content with a file id under an unknown key at depth 1, 2 and 3, in an array, as a URL, as "studio:<id>": 422 each; the
   known keys still work; a 300 KB content is refused by the config limit (CC3), 200 KB is taken.
 EE4: erase a wish with 3 files, one of them also named by another wish: 2 files' objects and rows go, the shared one stays.
 EE5: seal with a past time, no time, 6 years ahead: 422; openNow: true opens at once; changing the zone moves the instant.
 EE6: a draft cannot be erased (409), only removed. CC1/CC2: PATCH answers 200 {version, updatedAt}; a missing version is 422;
   keep takes null|month|half|year only. BB6: take-down, remove and erase each clear other people's saves of that wish.
 E-226: add photos to a draft (own confirmed files only); after seal 409.
Round 1 again: 50 seals at once gapless; 20 PATCHes one winner; another account's wish 404; no field or header moves an open time.
Also: the diff touches only src/modules/wishes and src/modules/jobs; anything NEW that is high or blocker.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/wishes src/modules/jobs src/modules/job-handlers` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b06/VERDICT-P.md (30 lines or fewer). Hand back in 14 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what you did not run.
