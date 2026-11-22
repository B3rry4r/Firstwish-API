PATCH P-CI-5 | TIER T1 (a business chosen for a person: identity) | Budget 40 steps. CI's full suite is red on ONE test that passes on this machine; find why and fix the cause.
THE MACHINE IS BUSY: run ONLY the one spec file (never the full suite), `--maxWorkers=1`; stop only PIDs you started.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HR3, IH2, IH3 in build/rulings-phase3.md, and the CI text in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ci371/fail.txt (run 371, head 04b2b7a; CI runs `WEB_LIB=/nonexistent/lib npm test` on a
fresh database after `node scripts/seed.mjs` twice; see .github/workflows/ci.yml).
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci5 of /home/user/Firstwish-API on a new local branch
`p-ci-5` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line); `npm ci`, `npx prisma generate`;
TEST_DB_PREFIX=pci5. Run every command with your own worktree as the working directory.
The failure: src/modules/pro-business/tests/ab12-business-header.spec.ts test "1d. Brand: an upload and the brand
itself go to the named business ..." line 198: `POST /v1/uploads {purpose: "brand"}` with NO x-business-id, by a
person who OWNS business Alpha and is a LOGIN of Beta, answered 422 in CI where 201 is expected (201 here).
 1. Find the cause; do not guess. Read how an upload with no header picks the business (and every other route
    that picks "the person's own business" with no header): a read with no order, a first-of-many, a clock, a
    limit counted across tests, the seed's rows, an env value CI sets differently. Reproduce the 422 (run the spec
    20 times; run it on a fresh database after the seed twice with CI's env; print the 422's body).
 2. If the server's choice is not fixed (the same request can land on the owned business or the one the person is
    a login of), that is a server bug: with no header the person's OWN business is chosen, the oldest they own,
    always (as the older routes do); fix it in one place and add a test that fails before the fix every time.
    If the cause is the test (shared rows, order, time), fix the test with test/kit/unique.ts and own-db.ts.
    No test skipped, no expectation loosened, no retry added.
 3. `npm run lint` EXIT 0; `npx tsc --noEmit -p tsconfig.json` EXIT 0; the spec 20 runs in a row: 0 failed; the
    specs of any other module you touched pass.
Commit on p-ci-5; do not push; leave the worktree (the lead merges and removes it); drop your databases. Hand back
in 8 lines: head; THE CAUSE with file:line and the 422's body; what changed; the EXIT lines and the 20-run total;
`git diff --stat`. If you cannot reproduce it, say exactly what you ran and what CI's log shows.
