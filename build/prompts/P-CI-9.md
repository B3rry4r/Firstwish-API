PATCH P-CI-9 | TIER T0 (one spec that fails at random) | Budget 25 steps. Test-only; change no src file that is not a test or a test kit.
Never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API itself; ONE heavy job at a time, jest with
`--maxWorkers=2`; quiet logs ending in an EXIT line.
Read test/kit/own-db.ts (ownDatabase), test/kit/unique.ts, and how P-CI-7 fixed the same kind (git log --grep "own database").
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci9 of /home/user/Firstwish-API on a new local branch `p-ci-9` from
claude/sleepy-mayer-f0hkb8 (the head in your spawn line); `npm ci`, `npx prisma generate`; TEST_DB_PREFIX=pci9.
The failure (twice in full runs on 24 Nov, never when run with only the payments folder): src/modules/showing/tests/api-base-5-staff.spec.ts:84
reads the staff payments list with limit=50 and expects its own rows on that page; in a full run other specs' payment
rows in the SHARED test database fill the page.
Do: the spec finds its own rows without depending on what else is in the table (its own database through
ownDatabase, or a filter the route already offers that names its own rows: say which and why); look for the SAME
fault in the other specs that read a first page of a shared list and expect their own rows on it (staff lists,
payments, refunds, wishes, concierge: grep for limit=50 and "first page" patterns) and fix the kind, listing each
file. No expectation loosened, no retry, no skip.
Checks: typecheck; `npm run lint`; scripts/gates.sh; the spec beside the payments, refunds and purchases folders ten
times with --maxWorkers=2: 0 failed; do NOT run the full suite (the lead's merge check runs it). Commit on p-ci-9; do
not push; remove your worktree. Hand back ONCE in 6 lines: head; the cause; each spec changed and how; the ten runs.
