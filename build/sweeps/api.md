# API: what is still open (16 Nov 2026, after the leftovers bundle INT-7). Closed lines are in api-closed.md.

## For the next API base (a registry or shared change)
- HG1 (ruling): a Concierge give carries the maker the staff member saw (expected maker); a mismatch is 409 order_changed and
  nothing changes. The give route's body gains the field; the staff Concierge screen (W14) sends it.
- draw-giveback.ts:44: a client-wish record with drawFrom "pack" and NO payment recorded skips the "source still stands"
  test, so a hand-built record could return a wish to a refunded pack. No route makes such a record and none exists (the
  column was filled for every row at the migration). Give back to a pack only when the business holds a standing pack grant.
- royalties/draw-source.ts:70: with two packs, after a wish of the first pack is given back, the next draw is sourced to the
  second pack (so it can be named for a sixth wish). Count each pack's standing draws separately.

## Not run against the real provider
- B08 and INT-7: the Paystack refund lookup by amount, the refund, the payout and the settlement calls (stand-ins and a local
  server only).

## Cannot be given back
- Draft client wishes removed before 16 Nov's change have no window job, so they give nothing back (there are none: nothing
  is live).
