PATCH T0 | CI is red on one test that needs the web app's files | Budget 25 steps.
Read /home/user/Firstwish-API/build/common-rules.md and ruling GD3 in build/rulings-phase3.md.
The fact: on GitHub the step "Test (full suite)" fails in src/modules/reference-data/tests/reference-data.spec.ts, test "each of
the four lists is counted against the web app's own files and every row is compared (GD3)": ENOENT on
/home/user/Firstwish-web/lib/occasions.ts. src/modules/reference-data/tests/web-files.ts:7 defaults WEB_LIB to that path; CI checks
out only this repository, so the file is not there. 1121 of 1122 pass.
Work: local branch `t0-ci-webfiles` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/t0-ci-webfiles (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; TEST_DB_PREFIX=t0web.
 1. scripts/export-seed-data.mjs also writes prisma/seed-data/SOURCE.json: for each web file it reads, the path relative to
    the web repo and the sha256 of its bytes. Run it (the web checkout is at /home/user/Firstwish-web on this machine) and commit
    the file; no other seed file may change (if one does, stop and report it).
 2. Two tests where there was one: (a) always runs, also in CI: the served rows of the four lists equal prisma/seed-data
    row for row and count for count; (b) runs only where the web checkout exists (WEB_LIB set or the default path present):
    the seed equals the web app's own files (the old comparison) AND SOURCE.json's hashes equal the files' (so a web change
    with no new export fails here). Where the web checkout is absent, (b) is reported by name as skipped with the words
    "NOT RUN: no web checkout", never silently passed and never failed.
 3. Grep every spec and test helper for /home/user/ and for any other path outside the repository; fix each the same way; list them.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, the spec with the web checkout present (both
run) and with WEB_LIB=/nonexistent (a passes, b skipped by name), `npm test` (--maxWorkers=2) once with
WEB_LIB=/nonexistent to stand in for CI (EXIT 0). Commit on t0-ci-webfiles; do not push; remove your worktree and databases.
Hand back in 6 lines: head; what changed; the other outside paths found; EXIT lines.
