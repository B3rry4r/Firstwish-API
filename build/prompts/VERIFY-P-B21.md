VERIFIER P-B21 re-check | TIER T1 (staff power) | Budget 25 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings FB3, FC1-FC3, TT3 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b21/VERDICT.md.
Under test: local branch `p-b21` (head 72594a0) against `b21-staff-reads` (d487d19): the diff of the two is all you check. Your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb21 (detached at p-b21; `npm ci`); TEST_DB_PREFIX=vpb21; a clock in 2198; remove both when done.
Check by id, each PASS or FAIL with what you saw (write your own matrix test; do not reuse the builder's):
 FC1  every action (ban, lift, erase; take_down, restore, extend, resend, refund) x every staff role (owner, ops, finance,
      support, moderator, reviewer, maker): exactly the roles in FC1 and FC3 succeed; every other cell is 403 with NO change in
      any table and NO audit row (compare row counts before and after); the check happens before the target is read (a
      refused role cannot tell an existing id from a missing one). An unknown action name is 422. The action cannot be
      smuggled (a body with two actions, an action in another letter case, an action in the query string).
      Refund: only the owner's is sent in the same step; ops leaves it waiting (TT3).
 FC2  extend: 4 calls pass, the 5th is 409; 10 at once: 4 pass; a wish's term really moves by 7 days each time and never
      more than 28 days in all. Resend: 3 a day per wish, the 4th 429 and no email; the next UTC day starts again; another
      wish is not slowed.
 FB3  the storage setting shows the adapter that runs; a change is 422 with no row and no audit row; other settings still
      change for the owner only.
 Also: the first verdict's "held" list still holds (reads show no words, photos, passcode, full contact).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, `npm run test:affected -- src/modules/staff-reads` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b21/VERDICT-P.md (20 lines or fewer). Hand back in 10 lines or fewer: merge or fix; findings by severity with file:line.
