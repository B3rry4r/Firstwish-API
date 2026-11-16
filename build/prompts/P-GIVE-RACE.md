PATCH concierge give race | TIER T2 | Budget 35 steps. One test failed once: find out whether the code lets two staff both win.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, ruling A9 in build/rulings-phase3.md (one maker owns an order).
The fact: in a full run with two workers, src/modules/concierge/tests/concierge.spec.ts "two staff giving the same order at
once" answered 200 and 200 where it expects one 200 and one 409 order_changed. Alone it passed 11 of 11, twice.
Work: local branch `p-give-race` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) of /home/user/Firstwish-API in your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-give-race (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; ports 5220-5229; TEST_DB_PREFIX=pgive.
Stay inside src/modules/concierge and its tests.
 1. Read how "give" decides (src/modules/concierge: the give route and service): is it one conditional statement on the
    order's state and maker (UPDATE ... WHERE ... RETURNING) or under a row lock, or a read followed by a write? Say in one
    line how two requests can both answer 200.
 2. Reproduce: 200 pairs of gives at once in a loop inside one test (and with the database slowed by a second load if
    needed); count how many pairs end 200/200, and after each pair read the order: who owns it, how many audit rows.
 3. If two can both win: that is a product defect (two makers told the order is theirs): make the give one atomic step so
    exactly one wins and the other is 409 with nothing written, also for give-again and for give racing cancel and
    delivery; tests with 50 at once. If the code is right and only the test is wrong (the two requests were both valid in
    turn: A gives to X, then B gives again to Y with a reason, which the ruling allows): say so with the evidence and fix
    the test so it tests what the ruling says without relying on timing.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, the concierge specs 30 times, `npm run
test:affected -- src/modules/concierge src/modules/payments` twice. Commit on p-give-race; do not push; remove your worktree
and databases. Hand back in 8 lines: head; the cause with file:line; code or test; the counts before and after.
