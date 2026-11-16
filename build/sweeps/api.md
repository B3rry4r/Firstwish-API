# Sweep list: API (lows; drained in one sweep bundle, never a fix round)

## Left for a shared change
- Schema (Verify round 2, low): an account hard delete is still possible at the database (payments SET NULL): needs a migration with a trigger refusing DELETE on account (the erase path only blanks).
- Schema (low): NumbersTarget.setBy is a plain uuid with no foreign key: needs schema.prisma and a migration (the FK to staff_account), then the spec that stores a target with no staff row fixed.
- B17 logins.service.ts: a downgrade that leaves more logins than the plan allows keeps them and says nothing: needs a MessageTemplate seed row for the owner's notice (prisma/seed-data) and a flag on the Login shape (src/contracts) so the page can show which to remove.
- B08 src/common/ports/adapters/paystack-refund-provider.ts findRefund (~43-48): takes the first non-failed refund by transaction reference with no amount check: needs a change in src/common (match the amount; NOT RUN against Paystack).
- B21 admin-wishes.service.ts resend: the day is counted on the audit rows' createdAt, which is the database's clock (schema default now()), not the Clock port: needs audit rows stamped from the Clock port, a change to every audit write (src/modules/audit shared by all modules).

## Not closed in this sweep
- P-B17b: deleting a draft made by E-30 does not give the drawn wish back (restorable within the window, then lost): needs a hook at the end of the restore window (wishes lifecycle) that reverses the business draw (month used - 1 only in the same month, or pack + 1); money-adjacent, so left for its own bundle with its own tests.

## From the sweep's check (lows, for the leftovers bundle)
- refunds/tests/join4.spec.ts ~165: the rolled-back test no longer notices a leaked trailing invoice number; assert the counter equals the highest number taken.
- vault/tests/vault.spec.ts:206-212: the resend loop retries any status that is not 200 or vault_full, a 500 included; narrow it to the wait time-out.
- price-book.contract.spec.ts Z3: the setup accepts 200 or 409 on the threshold put.
- moderation/reports.service.ts:125: the per-email limit treats a+1@ and a+2@ as different addresses (use canonicalEmail).
- pro-business/client-wishes.service.ts:129: an invited, not yet active, login counts as a member for making client wishes, while purchases/business-handlers.ts:80 needs an active one: make both need an active login.
- HG1 (ruling): a Concierge give carries the maker the staff member saw (expected maker); a mismatch is 409 order_changed. Needs the registry body of the give route to gain the field; the staff screen (W14) sends it.
