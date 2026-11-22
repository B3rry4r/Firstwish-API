PATCH P-API-BASE-13 round 1 | TIER T2 | Budget 70 steps. Close F1-F4 from the check of the thirteenth round; change nothing else.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`;
commit at every closed finding; stop only PIDs you started; final runs in the FOREGROUND.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-13.md, rulings II1, II2, II3 in build/rulings-phase3.md and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-13/VERDICT.md (the probes beside it show each finding).
Work: branch `api-base-13` (ba5db26) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-13
(`npm ci`, prisma generate); FIRST `git merge --no-ff claude/sleepy-mayer-f0hkb8` (17235a4: thirteen specs now hold the price
book lock for their file; keep both sides). Ports 5200-5209; TEST_DB_PREFIX=ab13. Do not edit a gate or a baseline.
A registry change (F3's field, if the contract shows it) goes in ONE reopen, as the first brief says.
 F1 MEDIUM hearts race (src/modules/vault/reveals-public.service.ts:189 against src/modules/stored-files/
    stored-files.service.ts:429): 30 marks in parallel with the files' removal leave hearts on gone files in every
    round. A mark and a removal of the same file cannot both win: either the mark is refused (422) or the removal
    clears it, in one transaction or under one row lock. Test: 30 parallel marks against the removal, 10 rounds:
    0 hearts on a gone file, and the reads show none.
 F2 MEDIUM src/modules/wishes/wish-pictures.ts:46-48: the owner's wish read gives "This photo was not accepted:
    <the screening's own sentence>. Choose another.": a provider's wording would reach a customer. Use the same
    fixed list by kind as E-184 (II2), one place for the list; the stand-in's label never reaches a read. Test.
 F3 RULING II3: a wish made under approved version 1 plays version 2 once version 2 is approved. The wish keeps
    the approved submission it was made under (an additive nullable column, set when the wish takes its style; a
    migration that fills it for wishes already made from the submission approved at that time, or the earliest
    approved one where that cannot be known: list the count); E-266 gives THAT version's document and files;
    E-196 and new wishes give the newest approved. Tests: v1 wish after v2 is approved plays v1; a new wish plays
    v2; a wish whose style changes before it is sealed takes the new style's current version; the erased-creator
    and switched-off cases still pass; the migration twice.
 F4 LOW (random failures): src/modules/studio/tests/api-base-7-patch.spec.ts runs with a 2036 clock and calls a
    sweep that takes any old file in the shared test database, so another spec's upload can vanish (ab13 "creator
    erased" failed 1 run in 10: upload confirm 404). A spec that runs a global sweep or moves the clock far ahead
    runs in its own database (test/kit/own-db.ts): do it for that spec and grep for every other spec that calls a
    global sweep on the shared database (list them). Prove: the studio specs together 10 times, 0 failed.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, scripts/gates.sh, check-contracts,
check-drift, check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0
failed. Commit on api-base-13; do not push; remove your worktree and databases; no background jobs. Hand back ONCE
in 10 lines: head; F1-F4 with file:line and the test's name; the new column and decision ids; totals; anything left.
