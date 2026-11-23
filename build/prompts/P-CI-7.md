PATCH P-CI-7 | TIER T1 test-only | Budget 45 steps. Specs that switch a shared catalogue row off (or change it) make other specs fail at random; fix the kind everywhere; change no src file that is not a test or a test kit.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f; final runs in the FOREGROUND.
Read /home/user/Firstwish-API/build/common-rules.md, test/kit/own-db.ts (ownDatabase), test/kit/setting-lock.ts (holdSettingLockForFile: how
the price book's shared row was handled), test/kit/unique.ts.
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ci7 of /home/user/Firstwish-API on a new local branch `p-ci-7`
from claude/sleepy-mayer-f0hkb8 (the head in your spawn line); `npm ci`, `npx prisma generate`; TEST_DB_PREFIX=pci7.
The failure (the lead's full run, 2 workers): src/modules/wishes/tests/ab15-ij2-style-rules.spec.ts:118: a ticket
start for a wish holding the HOUSE starter style answered 422 where 201 is expected; it passes alone. Another spec
running beside it switches a house style off and on (or changes its level, kinds or occasions) in the SHARED test
database, and the ticket start meets the style while it is off.
 1. Prove that cause (find the specs that write the shared `style` rows: switch off, level, kinds, occasions,
    delete; and the shared catalogue rows other specs read: styles, levels, occasions, the entitlements book,
    sample wishes): run the failing spec beside each suspect until it fails; say which.
 2. Fix the kind: a spec that CHANGES a shared catalogue row runs in its own database (ownDatabase) or makes its
    own style row with a unique slug and changes only that; a spec never changes a seeded row other specs read.
    Do it for EVERY such spec (list each file and what it changed), not only the one that collided today. If a
    lock is the only way for one of them, use one lock helper in test/kit (like the setting lock), and say why.
 3. No expectation loosened, no retry, no skip; no src change outside tests and test/kit.
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, gates.sh; the failing spec beside the
specs you changed, 10 times: 0 failed; then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` TWICE: 0 failed
both. Commit on p-ci-7; do not push; remove your worktree. Hand back ONCE in 8 lines: head; the cause (which spec,
which row); every spec changed and how; totals of both full runs.
