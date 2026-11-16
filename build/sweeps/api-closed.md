# Sweep list: API, closed (one line each: how it was closed)
- HE1 (seed ruling): scripts/seed.mjs creates a price, the promotion and a setting only when absent and never rewrites one (a49c96a); creators-money.spec.ts sets the payout threshold itself before each test and holds a database lock (test/kit/setting-lock.ts) beside price-book.contract.spec.ts, which also changes it.
- Tests that fail now and then: join4 J1 asserts its own invoice (past the counter it saw, one more than a number already issued, used once; the rolled-back test checks the issued numbers have no gap); price-book Z3 sets the threshold it then repeats; staff-accounts afterAll asks the drop again when the server answers "permission denied to terminate process"; the own-address specs in support-p-b20 count their own threads. int1-rulings U1 and vault "20 at once near the edge": see the hand-back for the cause found.
- .pipeline/env-manifest.json variables: already in the manifest and MANIFEST_VARS; RUNTIME_VARS is empty (env.schema.ts).
- 422 field errors and the 500 no-leak filter proven live: every contract spec posts bad bodies to real DTO routes and reads error.fields over HTTP.
- *FileId columns not linked: the file_refs triggers and stored_file_still_used (migration 20261116090000_files_links).
- Audit IP: networkOf cuts to /24 and /48 (audit/ip-network.ts).
- B12 BB7 and import: paged in the database with an anchor|days cursor, 404 for another account's id; the import answers skipped[{row, reason}].
- B04 public line promoKobo: priceOf drops it on the public book once the offer is not on (price-view.ts, test in price-book.contract.spec.ts).
- B05 note: kept on purpose (the money was taken; staff are flagged).
- B07 keep label and invited login: the longest remaining keep (pass-cover.ts KEEP_RANK); only an active login counts (business-handlers.ts).
- Staff invite wording: the invite MessageTemplate row exists in the seed.
- B17 login removed while requests are in flight: requireMember under the owner lock answers 404 and draws nothing (HD3).
- maskEmail twice: one masker in src/common/normalise/mask-email.ts.
- B13 E-133 per-email limit: 3 codes a day per address (report-limits.ts), test in moderation.contract.spec.ts.
- B13 fifth wrong code: says "No tries are left. Ask for a new one." (code_wrong), test in moderation.contract.spec.ts.
- B13 not exercised by the verifier: a note about the verifier's coverage, not a defect.
- B16 payout stand-in bank list: the stand-in cannot know the real list; the provider's list is the answer (NOT RUN).
- B15 studio-ai: the server holds no customer data there; only style is a catalogue value.
- Join 4 J8: issued tails are 12 characters; the guard keeps an erase from making a short slug.
- Join 4 J1 rolled-back-settle: the test uses a handler that throws after issue().
- B16/B07 Signed endsAt and days: the fulfil writes endsAt (start + days, SIGNED_DEFAULT_DAYS fallback; the price book carries days 30).
- B16 late transfer.reversed after mark-paid: ignored and flagged (ZZ8, payout-run.service.ts).
- B20 isOwnAddress: reply and reply+ are ours only on the mail domain (support/rules.ts, test in support-p-b20.spec.ts).
- B19 qr-cards race: a second asker waits up to 3 seconds for the first ask's file (test in qr-cards.spec.ts).
- B19 not run by the verifier: a note about the verifier's coverage, not a defect.
- B19 concierge pending payment: the abandon-payment job ends every pending payment after 60 minutes.
- B19 E-141 principal and 401: CB4 (UserOrStaff guard), done.
- B18 visit count and NN6 lock: bounded by 60 reads a minute; the lock is ruling NN6 (listed to the owner).
- Join 5 refund.processed before the refund is sent: RefundEvents.applyPending runs after the send (test in join5.spec.ts).
- INT-5 migration legacy-wish check: an applied migration cannot be edited; no live rows.
- B23 stale cut and closing mark: theoretical (port limit 60 s); a typed closing mark only affects the caller's own request.
- E-228: wish-keeps.service.ts accepts days, keep and keepKey; two that disagree are 422.
- Wave 3 join invite email wording: the invite template is in the seed.

## Closed 16 Nov by API-BASE-2 and P-PACK-REFUND (verified)
- HG1 (ruling): a Concierge give carries the maker the staff member saw (expected maker); a mismatch is 409 order_changed and
  nothing changes. The give route's body gains the field; the staff Concierge screen (W14) sends it.
- draw-giveback.ts:44: a client-wish record with drawFrom "pack" and NO payment recorded skips the "source still stands"
  test, so a hand-built record could return a wish to a refunded pack. No route makes such a record and none exists (the
  column was filled for every row at the migration). Give back to a pack only when the business holds a standing pack grant.
- royalties/draw-source.ts:70: with two packs, after a wish of the first pack is given back, the next draw is sourced to the
  second pack (so it can be named for a sixth wish). Count each pack's standing draws separately.

- HJ1: a pack refund takes away only that pack's own unused places. HK1: the stand-in mail file for test stacks.
