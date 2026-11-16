PATCH P-API-BASE-6 | TIER T2 money and identity | Budget 100 steps. Close the verifier's findings; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HU1-HU6 (and HS1-HS3, HR3) in build/rulings-phase3.md, and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab6/VERDICT.md (its probes are beside it: reproduce findings 1, 2 and 3 FIRST as failing tests).
Work: commit on local branch `api-base-6` (b162ce0) of /home/user/Firstwish-API in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab6 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab6 api-base-6`; `npm ci`; prisma generate); ports 5200-5209; TEST_DB_PREFIX=pab6. Work ONLY there. A
registry change (a field gone or added) is ONE reopen with decisions citing the HU ids, reconcile twice identical,
freeze; a migration is additive (a new column or table; never rewrite one already on the branch).
 F1 (HU1, findings 2, 3, 5) No guest account: wish-keeps.service.ts guest() goes; the link holder's payment is tied
    to the wish and the holder's proof with the payer's email on the payment row only; no Account is made or read by
    email; an email that has an account gets the same answers as one that has none (statuses, words, timing within
    reason); the result read works with the proof alone; two starts at once make one payment per payer (the
    builder's own test 7 passes 20 times in a row); receipts and a later refund still reach the email; the erase of
    a wish removes what the payment kept about the payer as the erase rules require (the AA2 gate).
 F2 (HU2, findings 1, 4) House wishes: no keep offer in the view; keep, wake and report refused with words (403 or
    409 as the registry's style has it); left out of staff Numbers (previews, paid, both windows), payouts,
    royalties and customer counts.
 F3 (HU3, finding 6) A holder's unfinished payment does not block the owner's keep or another holder's; a second
    settle for the same wish and term is marked refund due (the existing refunds helper) and its result read says so.
 F4 (HU4, finding 7) Only arrived voices count against 12; an ask with no upload holds no place and lapses; a limit
    per address and per link (say the numbers: suggest 5 asks per address per hour, 30 per link per day; make them
    settings beside the other limits); the owner can add their own and clear friends' voices at any count.
 F5 (HU5, finding 8) login_removed with words on /business/people, /business/approved-dates, /business/vault-files
    and every other business read (grep the guard: one place); /me leaves out removed businesses.
 F6 (HU6, finding 10) An abandoned payment later reported paid: fulfilled only if nothing else paid for the same
    intent since, else refund due; a plan never applied twice for one intent (test with the stand-in provider's late
    webhook). The public gather view sends no-store. returnsToPackOn is the business's local day (Africa/Lagos as
    the conventions set) or the instant: say which the contract means and make the two agree.
 F7 (finding 9) The decisions' text names the wrong endpoint ids: add a correcting decision (decisions are never
    edited) so the record is true.
Checks (quiet logs, EXIT lines): typecheck, eslint on every changed file, gates.sh, check-contracts, check-drift,
check-routes, the affected specs, `npm test -- --maxWorkers=2` twice with 0 failed (the reference-data "seed equals
the web app's own files" test may fail when the web checkout has moved: report it apart). Commit on api-base-6; do not
push; remove your worktree and databases; wait for your own runs and leave no background jobs. Hand back ONCE in 10
lines: head; F1-F7 closed or not with file:line and the test's name; totals; older test lines changed and why.
