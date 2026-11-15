PATCH wave 2 join | TIER T2 | Budget 70 steps. The last joins between this wave's bundles. Keep the diff small.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, rulings X10, BB6, AA5 in build/rulings-phase3.md, and the
"OPEN" and "NEW" lines of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b02/VERDICT-P.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b09/VERDICT-P.md.
Base: local branch `int-2` (the lead gives its head in the spawn line): identity, prices, account, files, styles, dates are all
merged in it. Work: local branch `p-join2` from int-2; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-join2 (`npm ci`); ports 4440-4449; database prefix pjoin2.
You may touch src/modules/** of this wave's bundles and src/common/ports/adapters/s3-storage.adapter.ts; nothing else.
 J1 (X10): the files bundle exports removeAccountFiles(accountId): after the erase transaction commits, every stored file the
    account owns (its sizes and objects too) is removed through the storage port, as a job row the cleanup handler runs (never a
    storage call inside the erase transaction). The erase service schedules it. Test: erase an account with 3 confirmed files:
    after the handler runs, no row and no object of theirs is left; another account's files are untouched; run twice: no error.
 J2 (BB6): the erase service calls SavedWishesService.forgetForWishes(tx, wishIds) for the erased account's wishes and deletes
    the erased account's own saved rows, in its transaction. Test: other people's saves of the erased account's wishes are gone.
 J3 (AA5): a business logo must be a stored file that is the caller's, purpose brand-logo, ready, and an image by its bytes
    (never SVG). Test: an SVG row, another purpose, another account's file, a rejected file: each 422; a real brand upload: 200.
 J4 (flaky test): src/modules/screening-results/tests/screening-results.contract.spec.ts:98 reads items[0] from a database other
    suites share: look the row up by its id.
 J5 (kernel, unproven on real storage): the presigned PUT URL must carry no x-amz-checksum-* parameter (the S3 client's
    requestChecksumCalculation and responseChecksumValidation set to WHEN_REQUIRED, or the parameter removed before signing).
    Test: the signed URL has no checksum parameter and still binds content type and length.
Checks (quiet logs, EXIT lines): build, typecheck, lint on changed files, gates.sh, check-contracts, migrate deploy on a fresh
database, `npm run test:affected -- src/modules src/common test` THREE times (a failure in any run is a finding: name the test).
Commit (do not push); remove your worktree and databases. Hand back in 8 lines: head sha; J1 to J5 closed or not with the test
names; any test that failed in any of the three runs; counts (tests, suites); EXIT lines.
