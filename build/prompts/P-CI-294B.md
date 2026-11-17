PATCH P-CI-294b | TIER T1 test-only | Budget 60 steps. Redo the collision-free test values; the first try broke one test and was reverted.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit as you go; stop only PIDs you started.
Read /home/user/Firstwish-API/build/common-rules.md and the first brief build/prompts/P-CI-294.md. The first try is local branch `p-ci-294` (head
d9cc61f): test/kit/unique.ts with testWishNo (`tag-<hex>`) and testSlug, used in 16 specs and
src/modules/showing/tests/b13-kit.ts. Merged, it failed CI three runs in a row on exactly one test:
src/modules/showing/tests/api-base-4-staff.spec.ts "GET /v1/admin/people finds the person by a wish number (also as
'Wish № 0412')": the staff search (src/modules/staff-reads/admin-people.service.ts:67-69) reads a wish number out
of "Wish № <digits>" only when the query is digits and those words; a test number with letters is never found.
The first agent did not see it because the five specs that use b13-kit (api-base-4*, join4-showing,
showing.contract) "failed alone" on this machine with 503 on GET wish, with or without its change.
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci294b of /home/user/Firstwish-API on a new local branch `p-ci-294b` made from branch p-ci-294, then merge
claude/sleepy-mayer-f0hkb8 into it (the work branch holds a revert of p-ci-294's merge: after the merge make sure
the helper and every spec change of p-ci-294 are PRESENT in your tree: `git diff claude/sleepy-mayer-f0hkb8 --stat`
must show them; if the revert removed them, re-apply with `git checkout p-ci-294 -- test/kit/unique.ts <the specs>`);
`npm ci`; prisma generate; TEST_DB_PREFIX=pci294b. Run every command with your own worktree as the working directory.
 1. A test wish number is DIGITS ONLY, in the shape the product's own searches and screens read (see
    wishes.service issueNumber and the staff NO pattern), and still cannot collide: digits drawn from a fresh
    random id, long enough that two specs can never make the same one and the product's own counter can never
    reach it (say the length and why). testSlug stays.
 2. Why do the five b13-kit specs answer 503 on GET wish when run alone here? Find it (a missing stand-in, Redis,
    an env value the full run sets, an order dependence) and make each pass alone; if it is this machine's state
    and not the code, say exactly what and leave the code.
 3. Prove: each changed spec alone; the five b13-kit specs alone; then `WEB_LIB=/nonexistent/lib npm test` (CI's
    command) TWICE in a row with 0 failed, as the only heavy job you run at that time. typecheck, eslint on changed
    files, gates.sh EXIT 0.
Commit on p-ci-294b; do not push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 7
lines: head; the helper's number shape (file:line); the cause of the 503s; both full-run totals; `git diff --stat`
against claude/sleepy-mayer-f0hkb8.
