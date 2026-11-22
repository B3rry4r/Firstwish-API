PATCH P-CI-4 | TIER T0 test-only | Budget 20 steps. CI is red at the Lint step; make `npm run lint` exit 0.
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci4 of /home/user/Firstwish-API on a new local
branch `p-ci-4` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line); `npm ci`, `npx prisma generate`.
Run every command with your own worktree as the working directory. No server, no browser.
 1. src/modules/pro-business/tests/ab12-business-header.spec.ts:117 `Unsafe return of a value of type any[]`
    (@typescript-eslint/no-unsafe-return): type the response body the helper reads (as the `same` helper two lines
    below does) so nothing is `any`. No eslint-disable comment, no rule or config change, no src file that is not
    this test.
 2. `(npm run lint; echo "EXIT $?") > lint.log 2>&1; tail -n 15 lint.log`: EXIT 0 with 0 errors. If other errors
    show, fix them the same way in test files only and list each; an error in a non-test src file: stop and report.
 3. `npx tsc --noEmit -p tsconfig.json` EXIT 0; the one spec: `TEST_DB_PREFIX=pci4 npm test -- <the spec file>`
    passes (same number of tests as before).
Commit on p-ci-4; do not push; remove nothing but your own log files (leave the worktree: the lead merges from the
branch and removes it). Hand back in 6 lines: head; the lines changed; the three EXIT lines; `git diff --stat`.
