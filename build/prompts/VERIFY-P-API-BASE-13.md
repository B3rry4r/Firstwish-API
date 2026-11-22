VERIFIER P-API-BASE-13 (re-check of round 1) | TIER T2 (a migration on the wish table) | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-13/NOTES2.md as you go; stop only PIDs you started.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-API-BASE-13.md (F1-F4 are the contract), rulings II1, II2, II3 in
build/rulings-phase3.md and the first verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-13/VERDICT.md (the first
verifier's probes are beside it: probe-*.spec.ts; reuse them).
Under test: /home/user/Firstwish-API local branch `api-base-13` (head 8d28b97; it holds the work head) against ba5db26 (the head first
checked). Your own detached worktree .../build/wt/v-ab13 (`npm ci`, prisma generate); ports 5210-5219;
TEST_DB_PREFIX=vab13. Probes under the verify folder, not in the repo.
 F1 hearts race: rerun the first verifier's parallel probe (30 marks against the files' removal) 10 rounds on the
    head: 0 hearts on a gone file in the stored rows AND in the client and business reads. Then look for what the
    new lock order could break: marks and removals of DIFFERENT files in parallel (no deadlock, no 500), 30 marks
    of one file in parallel (one heart), a removal while 61 marks queue (the limits' words).
 F2 the wish photo's reason: for every screening kind and an unknown one, the owner's wish read shows the fixed
    words and never the screening's sentence; the one older expectation changed (people/tests/
    api-base-6-small.spec.ts:141) follows II2 and nothing else in that file was loosened.
 F3 (II3) the version a wish plays, and the migration (20261205090000_wish_style_version_ab13r1). On the BASE
    ba5db26 build live-shaped rows: wishes made before any submission, between v1's and v2's approval, after v2;
    a wish in a house style; a wish in a style later switched off; a wish whose creator was erased; a removed wish;
    a wish in a style with only a refused submission. Migrate: which submission each wish got (a wish must never
    point at a submission of ANOTHER style or an unapproved one); twice identical; the notice's count; is there a
    way back, and what does undoing it lose. Then through the routes: a v1 wish plays v1 after v2 is approved; a
    new wish plays v2; a wish that changes style before sealing. THE FILES: the builder says files are per style,
    not per version, so a v1 wish gets "the style's files created before the next approved submission was sent
    in", and a file the creator deletes while editing for v2 is gone for v1 wishes too. Show exactly what a paid
    v1 wish plays after the creator deletes one v1 picture and v2 is approved (a missing picture? a broken
    address? nothing?) and say how bad it is. Deleting the pointed submission row: what the wish then plays.
 F4: the studio spec folder 5 times together: 0 failed. The builder left three specs that sweep the SHARED
    database (ab11b-fix, which also moves the clock 31 days; files-erase; stored-files.contract): can any of them
    take another spec's fresh upload (read the sweep's condition)? Say yes or no with the line.
 Also: typecheck, the WHOLE `npm run lint`, gates.sh, check-contracts, check-drift, check-routes exit 0;
 `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: totals.
Write VERDICT2.md beside the notes (30 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktree and databases. Hand back ONCE in 15 lines or fewer.
