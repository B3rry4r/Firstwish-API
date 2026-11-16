VERIFIER API-BASE-7 | TIER T2 money and identity, full | Budget 120 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-7.md (its 8 cases are the contract), rulings HW1-HW7, HU1, R11,
R14 in build/rulings.md and build/rulings-phase3.md, and the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/api-base-7-claims.txt.
Under test: /home/user/Firstwish-API, local branch `api-base-7` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab7 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab7. Run every command with
your own worktree as the working directory. Probes as specs under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab7/ (not in the repo). Remove
your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). In this order:
 - Receipts (HW1, money): for EVERY line a payment can carry (ticket, extra, keep, wake by owner and by link holder,
   plan, pack, Vault space, Concierge, credits, creator plan): exactly one receipt in the stand-in outbox, to the
   right address (the link payer's email for a holder, HU1: and NO receipt to an account that merely has that
   email), with the amount, the VAT part only where the invoice has one, and the reference. None on: a replayed
   webhook, two settles at once (30 pairs), the retried settle after a deadlock, a failed payment, a payment later
   marked refund due (what IS sent then?). A refund sends its notice once (two refund calls at once). The email is
   sent inside the settle transaction: if the mail port throws, does the payment still settle (it must: a receipt
   never blocks money), and is the receipt then lost for good or sent later? Say which.
 - Studio files (HW2, identity): another creator, a person with no creator side and a signed-out caller on E-267 and
   E-268 and on the uploads with someone else's draft styleId: 404 / 401, never a url. The player read E-266: a
   wish in a DRAFT, in-review, sent-back, withdrawn or taken-down style gives no files; an approved one gives only
   that style's ready files (not screening or refused ones, not another style's); a resting, ended or passcode-locked
   wish: what does it give? Limits from the book: a sound of 10 MB + 1 byte and a model of 15 MB + 1 byte are
   refused with words; change the limit in staff Prices and it moves. The migration dropped the stored_file styleId
   key: can a file now name a style id that does not exist, or another creator's style (try both)? What happens to
   a style's files when the draft is deleted, and when the creator's account is erased?
 - Signed and plan (HW3, money): Signed off then on again before the paid day charges nothing; after the paid day it
   is off and a new on needs a payment; Creator to Open keeps Creator's rights until the paid day and no longer; the
   renewal job does not charge after either; the ledger and the invoices do not move on the switch; do both at once
   in two requests; a person who never paid calls them.
 - The book (HW4, HW6): the payout threshold and day change through staff Prices (audited, role-checked: who may)
   and the NEXT payout run uses them (a creator at 4,999 and at 5,000 kobo-equivalent either side of a moved
   threshold); the Concierge hours and the photo limits move in the read and in the code together. The builder read
   "the erase-now period" as unopenedDays: find what the code really uses when a person erases a wish or an account
   now (the website says "gone for good within 24 hours": src/modules/accounts/account-erasure.service.ts and the
   wish removal path) and say whether THAT period is in the book and whether the read serves it.
 - Staff (HW7): the session read's per-section actions equal what the routes really allow: for each of moderator,
   finance, support, owner, call every staff write and compare (a table of mismatches only). The typed reads: do
   the contract's new shapes equal what the routes return (check-contracts passes: also read three by hand)?
 - The sweep (HW5): a confirmed upload attached to a wish, a brand, a shoot, a style, a profile, a gather voice and
   a Vault file all survive at 8 days; an unattached one goes at 7 days and its bytes go from storage.
 - Older tests the builder changed (notices.spec.ts ~373-375; price-book.contract.spec.ts:414): right by the rulings?
 - Then: gates.sh, check-contracts, check-drift, check-routes EXIT 0; `npm test -- --maxWorkers=2` once, 0 failed.
Hand back ONCE in at most 20 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run.
