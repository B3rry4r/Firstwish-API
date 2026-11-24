PATCH P-CI-10 | TIER T1 test-only | Budget 40 steps. Two clip specs fail when they run beside other folders; find the shared row and stop it; change no src file that is not a test or a test kit.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2`; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves.
Read /home/user/Firstwish-API/build/common-rules.md, test/kit/own-db.ts (ownDatabase), test/kit/setting-lock.ts, test/kit/unique.ts, and build/prompts/P-CI-7.md
(the same kind of fault, fixed once before: follow its rule).
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci10 of /home/user/Firstwish-API on a new local branch `p-ci-10`
from claude/sleepy-mayer-f0hkb8 (the head in your spawn line); `npm ci`, `npx prisma generate`; TEST_DB_PREFIX=pci10.
The failure (a verifier, 24 Nov, on the work head too): src/modules/stored-files/tests/ab21-clips.spec.ts and ab21b-clips.spec.ts: 5 tests fail
with a ticket start answering 409 when the two run in one command with the ports, stored-files and staff-reads folders' specs at 2 workers; the pair
alone passes 10 of 10. Its notes: /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-22/NOTES.md (attack 6).
 1. Reproduce it with that command; find WHICH spec and WHICH shared row makes the 409 (a price book row, an
    entitlement, a setting, a ticket offer, a person made with a fixed email or phone): prove it by running the
    pair beside the one suspect.
 2. Fix the kind: a spec that changes a shared row runs in its own database (ownDatabase) or makes its own rows
    with unique names; do it for every spec you find doing the same, and list each.
 3. No expectation loosened, no retry, no skip; no src change outside tests and test/kit.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, scripts/gates.sh; the failing command 10 times: 0
failed; do NOT run the full suite (the lead's merge check runs it; if your session refuses a command, do not retry
and ask nobody: say NOT RUN). Commit on p-ci-10; do not push; remove your worktree; drop your databases. Hand back
ONCE in 8 lines: head; the cause (which spec, which row); every spec changed and how; the ten runs' totals.
