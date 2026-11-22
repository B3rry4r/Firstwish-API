VERIFIER P-API-BASE-12 (re-check of a patch) | TIER T2 (money: who is paid; identity: whose people) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab12/round2/NOTES.md (if it exists an earlier verifier was lost: read it and carry on).
Read rulings IH1, IH2, IH3 in /home/user/Firstwish-API/build/rulings-phase3.md and the first check's notes and probes in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab12/
(NOTES.md, backfill.txt, identity-matrix.txt: reuse the probes).
Under test: /home/user/Firstwish-API local branch `api-base-12` (head in your spawn line; the patch is the commit after eadccfe). Your own
detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab12b (`npm ci`, prisma generate), plus a base worktree only if you need one; ports
5210-5219; TEST_DB_PREFIX=vab12b. Run every command with your own worktree as the working directory. Remove your
worktrees and databases when done.
Re-check ONLY these (each PASS or FAIL with what you saw):
 F1 (IH1, was HIGH, money): build on the BASE commit the first check's shapes S1, S3, S3b, S4b, S5, S6 and add: a
    style with submissions by TWO creators; a submission by an erased creator; a submission that was rejected or
    withdrawn (is a rejected submission proof of making? say what the migration does and whether a person who
    only SUBMITTED someone else's style could be paid); a submission by a suspended creator. Migrate, twice. No
    style is tied to an account without a submission by that one account; a new wish in an untied style pays no
    creator and its money is not lost from the ledger (where does the creator's share go: say); a wish in a tied
    style pays the submitter; past royalty and ledger rows unchanged; the notice and E-193 list every untied
    style with its handle. A style tied to anyone but its maker is HIGH.
 F2 (IH2, was MEDIUM): the identity matrix again, branch against base: a login gets the base's 403 on every People
    and approved-dates route with the header and without it; a login's plan and pack start answer the same with
    the header and without (and land on the named business); brand PATCH and upload stay the owner's; an owner of
    A who is a login of B manages A's people with A's id and gets 403 for B's.
 F3 (IH3): a business the caller is not in, an unknown id, a non-id, an upper-case id in the header: the changed
    routes answer what GET /v1/business/plan (an older route) answers for the same header (status, code, words).
 Also: check-contracts, check-drift, check-routes, gates.sh, typecheck EXIT 0; the full suite ONCE
 (`WEB_LIB=/nonexistent/lib npm test`).
Hand back ONCE in at most 15 lines: verdict (merge / fix first), each F with PASS or FAIL and file:line, new findings by severity.
