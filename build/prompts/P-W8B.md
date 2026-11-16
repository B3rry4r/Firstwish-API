PATCH P-W8b | TIER T2 money | Budget 30 steps. Two findings of the second check on the business Plan screen; a small diff the lead reads.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules) and ruling HR1 in /home/user/Firstwish-API/build/rulings-phase3.md. The finding: after a
person opens the pay sheet for a plan and leaves without paying, the Plan screen says "A payment for Pro Starter is
waiting for the provider. Another plan payment cannot start until it ends.", the pay button reads "A payment is
waiting" and is disabled for every plan, also after a reload, for up to 60 minutes (until the server closes the
unfinished payment). A person who wants to pay cannot.
Work: branch `w8-business1` (9d785fa) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w8b (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w8b w8-business1`; `npm ci`). Touch only app/app/pro/plan/page.tsx, its styles, and the not-allowed
state in components/app/pro/ui.tsx. No stack is needed unless you choose to prove it live (then: an API worktree at
the commit in your spawn line, ports 5460-5479, prefix pw8b, a built web; patch lib/staff-screens.ts LOCALLY to build
(version: 0 on lines 106 and 110) and never commit it).
 F1 (high) An unfinished plan payment never blocks paying: the pay control stays usable for every plan. When the
    payments read shows an unfinished plan payment of this business, one line says so plainly and truly: that a
    payment opened earlier was not finished, that paying now starts a new one, and that the unfinished one closes on
    its own (do not promise a time the server does not give; do not say "the provider is waiting"). The sentence
    that says what paying will do (HR1) stays and stays true. A payment that is truly being confirmed right now (the
    person just paid and the result is not read yet: the return page's state) still shows as being confirmed there.
 F2 (low) The not-allowed state's button "Back to your wishes" is one line at 360.
Prove with a rendered check at 360 (the Plan screen with an unfinished payment: the pay control enabled, the line
shown) or a live run: say which. Checks (quiet logs, EXIT lines): typecheck (your files), lint, check:css, `npm run
gates` (0 fail, no new finding), `npm run test:client`. Commit on w8-business1; do not push; remove your worktree;
leave no background jobs. Hand back ONCE in 6 lines: head; F1, F2 closed or not with file:line; the exact line of
copy; `git diff --stat` against 9d785fa.
