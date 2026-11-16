BUILDER API-BASE-7 | TIER T2 | Budget 220 steps. What the staff screens, Studio and the website still need from the server; change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HW1-HW7, HU1, R11, R14 in build/rulings.md and build/rulings-phase3.md, the list
build/sweeps/api.md (the section "For API-BASE-7") and how API-BASE-6 reopened the registry (build/prompts/
API-BASE-6.md). ONE reopen for all registry changes here, decisions citing the ruling ids, reconcile twice identical,
freeze; ids already issued never change; `.pipeline/ui-align-tasks.json` must come out byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-7` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-7 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab7. Run every command with your
own worktree as the working directory; never commit on claude/sleepy-mayer-f0hkb8 itself. Do not edit a gate or a
baseline; an older test changes only where a ruling makes its expectation wrong (name each line and why; HALT if
unsure). A test that needs its own prices or settings makes its own. No deferral phrasing in src comments (the gate
"no deferral phrasing" reads them: say what the code does).
Cases (through the real routes; a test for each; in this order: if the budget runs out, hand back the rest by number;
wait for your own test runs to finish before you hand back):
 1. HW1 receipts: one email per settled payment (every line: ticket, extra, keep, wake, plan, pack, Vault space,
    Concierge, credits, creator plan), to the account's email or the link payer's; a replayed webhook, a second
    settle and a retried settle send none; a refund sends its notice; the stand-in outbox shows them; the staff
    Messages read lists the templates.
 2. HW2 Studio files: the upload purposes (style picture, poster, sound, model; a creator's profile picture) with
    a draft's style id; limits from the price book; the owner's signed reads (list and one); another creator: 404;
    a player of a wish in an APPROVED style reads that style's files; a draft's files stay private; /me and the
    creator read carry the profile picture.
 3. HW3: turn Signed off; move from Creator to Open; each read says until which day; back on before that day costs
    nothing; no renewal after; nothing refunded; the ledger is untouched by the switch itself.
 4. HW4: the price-book read serves the payout threshold and day with the provisional mark; staff Prices changes
    them (audited); the payout run reads them.
 5. HW6: Concierge delivery hours, the erase-now period and the photo limits come from the book in the read AND in
    the code that acts on them (one source; change one in a test and both move).
 6. HW7: the staff session read gives per-section actions for the role; the staff payment, refund, ledger,
    business, wish, person, payout and numbers reads are typed in the contract (name each loose shape you closed).
 7. HW5: the sweep removes a confirmed, unattached upload after 7 days and never one that is attached.
 8. GET /v1/wishes rows carry `publish` as the detail does.
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, scripts/gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `npm test -- --maxWorkers=2` once with 0 failed. Commit on api-base-7; do not
push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 10 lines: head; each case
closed or not with the test's name; new endpoint and decision ids; totals; what you could not do and why.
