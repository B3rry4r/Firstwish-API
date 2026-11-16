# API: what is still open (16 Nov 2026, after the leftovers bundle INT-7). Closed lines are in api-closed.md.

## For the next API base (a registry or shared change)
- API-BASE-4 closed the wiring's items (HP1 to HP13) and the two low lines (the stored makerNote is bounded by the merge; a body nested deeper than 32 is 422).
- Pack fallback (TT5 path, draws with no record: none exist, nothing is live): at most one paid place can be lost on a
  refund when an unrecorded draw was really the refunded pack's. Accepted.

## Not run against the real provider
- B08 and INT-7: the Paystack refund lookup by amount, the refund, the payout and the settlement calls (stand-ins and a local
  server only).

## Cannot be given back
- Draft client wishes removed before 16 Nov's change have no window job, so they give nothing back (there are none: nothing
  is live).
