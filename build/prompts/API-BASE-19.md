BUILDER API-BASE-19 | TIER T2 (a receiver's secret; a paid extra) | Budget 150 steps. Three tasks from a verifier's findings; nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; a commit at every closed case; never
pkill, killall or pgrep -f (stop only PIDs you started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md; rulings IK1 to IK5 (the END of /home/user/Firstwish-API/build/rulings-phase3.md), Q8, GG7, LL3, HP5 there;
the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ua-rows/VERDICT.md (its file:line list).
Work: /home/user/Firstwish-API, local branch `api-base-19` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-19 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=ab19. Do not edit a gate or a
baseline; an older test changes only where a ruling makes its expectation wrong (name each line and why). Registry:
ONE reopen, additive only (new optional fields, new refusal codes), with DEC rows; no field renamed or removed.
For every case: a test through the real routes; FIRST show what the head does today.
Task 1 (IK1, IK2: src/modules/wishes/wishes.service.ts save and seal; public-wishes.service.ts:198 verify):
 a. seal a draft whose opening is `passcode` or `question` with passcodeHash null: today 200? Must be 422 with words
    ("Set the passcode before you seal it." / "Set the answer..."); the same through every route that seals (a
    business order, a Concierge order, a group wish, staff): list each route and its test.
 b. a save that changes the opening to one with no secret clears passcodeHash; one that changes passcode <-> question
    without a new `passcode` clears it too (the old secret must not answer the new question).
 c. content.opening.values never stores `code` or `answer` (strip them; keep hint and question); no read returns them.
 d. IK2: a question's answer matches without case or outer spaces ("BAOBAB", " baobab ": open); a passcode: exact.
    The wrong-try counts and locks unchanged (10 an hour per address, 30 lock the link): prove still true.
Task 2 (IK3, IK4: src/modules/render-jobs, the payment start for the extra, the wish read):
 a. no renderer configured: the payment start for the portrait video extra is refused (a 409 or 422 with words and a
    code: pick one, say which) and no payment row is made; the wish read carries whether the extra can be bought
    (additive field); a wish that already holds the extra and meets no renderer keeps the 503 on the ask (already paid:
    say what the person is told).
 b. PROVIDERS=standin binds StandinVideoRenderer (a switch like STANDIN_SCREENING to make it fail: STANDIN_VIDEO=fail;
    refused at boot with live providers); the job runs to ready and to failed on a stack; ask again after failed.
 c. ready: the video read gives a short-lived signed download address for the stored file (owner only; another
    person 404; signed out 401); the bytes at that address are the stored file.
 d. a second payment start for the extra on a wish that holds it: refused (words), no second charge.
Task 3 (IK5: src/modules/studio/studio-doc.ts:61, submission-checks.ts): a save and a send-in with an unknown base look,
 a layout or an added kind outside the allowed lists: 422 naming the field; every document the web's editor makes
 today still saves (prove with the repo's seed styles and the specs' documents). doc.seen: no rule reads it (a note).
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the wishes,
payments, render-jobs, studio and public-wishes folders' specs; then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2`
once: 0 failed. Commit on api-base-19; do not push; remove your worktree. Hand back ONCE in 12 lines: head; each
case before and after; registry and DEC ids added; older tests changed and why; full run totals; what was NOT run.
