VERIFIER P-PACK-REFUND | TIER T2 money, full | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-PACK-REFUND.md (its five cases are the contract), rulings HJ1, HK1,
TT5, HF1, HF2, HD2 in build/rulings-phase3.md, and the claims in your spawn line.
Under test: /home/user/Firstwish-API, local branch `p-pack-refund` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ppr (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vppr. Probes as specs under
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ppr/ (not in the repo). Remove your worktree and databases when done.
Attack through the real routes and stand-in payments (each PASS or FAIL with what you saw):
 - HJ1: your own by-hand model, written before reading the fix: 300 random orders over 1, 2 and 3 packs of buys, draws,
   give-backs (remove route, window job, erase), refunds of any pack at any time, and expiry: after EVERY step the counter
   equals the sum over standing packs of (size - standing draws) and no draw succeeds beyond it; each refunded pack's
   `drawn` equals its own standing draws at the refund; nobody ever holds a wish on a refunded pack; a business is never
   left with fewer places than it paid for on standing packs.
 - Races: a refund of A racing 20 draws; racing 20 give-backs to A and to B; two refunds at once (A and B; A twice): the
   counter never negative, never above the model, each refund lands once.
 - The fallback: draws with no record (the TT5 path): what happens with one recorded and one unrecorded draw on two packs;
   is any paid place lost or any free wish made? Plan side: a plan refund mid-month and packEnds behave as on the base.
 - HK1: with STANDIN_MAIL_OUTBOX set the file gets one JSON line per message and a code from it signs in; unset: no file;
   set with PROVIDERS=live, and with NODE_ENV=production: the app refuses to start (run the real bootstrap, not only the
   env parser); the real Resend adapter never writes it (read the code path); the file never holds a message when the
   variable is unset mid-run; no route exposes mail (check-routes, grep); a path like ../../etc/x or a directory: what
   happens (no crash loop, no write outside what the operator named); file mode is not world-readable or say what it is.
 - The optional `template` on the email port: every caller still compiles; the real adapter ignores or carries it safely.
 - Suites: the builder reports 109 suites and 1163 tests; the base ran 112 suites and 1154 tests. Explain the suite count
   (list any spec file the base has and the branch lacks, or that jest no longer picks up): a lost suite is a BLOCKER.
 - `npm test -- --maxWorkers=2` once: totals, name any failure; gates.sh, check-contracts, check-drift, check-routes.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ppr/VERDICT.md (30 lines or fewer). Hand back in 15 lines or fewer: merge or fix; findings by
severity (blocker, high, medium, low) with file:line; what you could not run.
