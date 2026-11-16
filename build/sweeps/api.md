# Sweep list: API (lows; INT-7 closed everything below the line it could close)

## Left open (what INT-7 could not close, and why)
- B08 src/common/ports/adapters/paystack-refund-provider.ts findRefund now matches the amount (test/int7/leftovers.spec.ts, against a local stand-in server). NOT RUN against Paystack itself: the shape of its refund list (the `amount` field, in kobo) is as its documentation says, never seen live; it runs when the owner gives the test keys.
- INT-7 give-back (P-B17b): a business draft removed BEFORE this change has no restore-window job, so it stays removed and gives nothing back. Only drafts removed from now on are scheduled. A one-off backfill would need the owner's rule for how old such a draft may be; none is given.
