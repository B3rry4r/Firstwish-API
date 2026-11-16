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

## Closed by API-BASE-5 (DEC-229 to DEC-234)
- W13's verifier: erasing an erased person is 409 (the repeat of a take-down on a taken-down or erased wish and of a ban of the same scope
  already answered 409 with words on the routes checked: the old line was stale); staff erase is immediate as FC1 rules (no waiting
  period; the 30 days and the 24 hours in the documents are a deleted wish's restore window and Erase now); staff wish search takes the
  number in any case and a piece of an email; the payout day, the price-book versions read, the payments state filter and the
  businesses search are in.
- API-BASE-4's verifier: the Clock port in notices.service.ts and vault/reveals.service.ts (a delivery row is stamped from it too).

## For the next API base (API-BASE-6: one registry reopen)
- Case 6: the staff reads typed as the server answers (payment detail, refund, ledger, business, wish, person, creator, moderation,
  showing): shape types by decision, from the web's lib/admin/w13-api.ts and c-live.ts.
- Case 7, the part not done: ending-purposes rows carry a display name and a line; today `name` is the slug (the registry has id,
  line, name and no slug field, so it needs one).
- Case 8: the receiver's keep and wake by link (HA1, HA2), a resting wish's "resting" state at its link, weddingDate on the public view.
- Case 9: the house showcase wish of each style and showcaseSlug on the styles read (the seed holds 43 styles, every one a house style).
- A friend with a wish's link has no route to add a voice (HQ4's "friends add voices"): the contribution flow is a product decision.
- Test stacks: the stand-in storage accepts the signed put only after the upload ticket was signed in the same process (its bound map is
  in memory); a restart between the ticket and the put refuses it.

## From API-BASE-4's verifier (accepted)
- A signed picture url is stateless: one given before a take-down still serves its bytes until its 10 minutes end. Accepted.
