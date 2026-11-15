VERIFIER P-B07 | TIER T2 money, re-check by ruling id | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B07.md, rulings HH1-HH9, MM3 in build/rulings-phase3.md,
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b07/VERDICT.md (round 1) and /home/user/Firstwish-web/lib/pro-data.ts (roll(): the rule the server must follow).
Under test: local branch `p-b07` (head 7dcd28b) of /home/user/Firstwish-API; base local branch int-3 at b25e069. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b07 (detached at the branch; `npm ci`); ports 4640-4649; TEST_DB_PREFIX=vpb07 for every run; a clock in the year 2160
for your own cases; remove both when done; kill by PID.
Known and NOT findings (MM3): HH5 (refund_due on an erased account's payment) and HH8 (the contract's ticket field) are open by
ruling, closed elsewhere.
With your OWN script through the REAL settle path (a started payment, then a signed stand-in webhook) on createTestApp and the
clock port, say CLOSED or OPEN for each:
 HH1: work these by hand from roll() in lib/pro-data.ts FIRST, write your expected numbers, then run them: (a) Starter paid 1 Dec,
      4 used, paid again 20 Dec: on 5 Jan how many draws work and what is renews; (b) a plan paid on the 31st, read in February
      and March; (c) two months with no read at all, then a draw; (d) a lapsed plan (renews passed, no payment): the month's
      allowance is closed, pack wishes still draw; (e) Studio to Starter and Starter to Studio mid-month. Any mismatch with the
      app's rule is HIGH: show both numbers.
 HH2: 10 webhooks + 10 verifies at once on one payment, 10 rounds: granted once each round, no 500 or 503 at all.
 HH3: revoke the older of two plan payments (the newer stands); the newer (the older stands if in its period); a pack with 2 of
      5 used; a Pass with wishes drawn; revoke twice. After each, the state equals what the remaining grants give.
 HH4: revoke one of two keeps: keep, keptBy, keptUntil and endsAt match the keep that remains.
 HH6: a plan or pack paid by an account that is not the business's owner or live login: nothing granted, flagged refund_due.
 HH7: a draw on a lapsed plan takes from the pack only. HH9: the builder's "two keeps at once" 20 times: all pass.
Money, again: every seeded line paid grants exactly what the web app says (the round-1 table); Pass 1 left with 30 draws: one
yes; allowance 3 + pack 5 with 20 draws: 8, allowance first; a handler that throws leaves nothing and the retry grants once.
Also: `npm run build` and typecheck now pass on this branch (EXIT 0: the base's grants.ts error is gone); the diff touches only
src/modules/purchases and the one grant read in src/modules/payments/settlement.service.ts; anything NEW that is high or blocker.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/purchases src/modules/payments src/modules/wishes` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b07/VERDICT-P.md (30 lines or fewer). Hand back in 14 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what you did not run.
