# API: what is still open (16 Nov 2026, after the leftovers bundle INT-7). Closed lines are in api-closed.md.

## For the next API base (a registry or shared change)
- Everything the wiring found is in build/prompts/API-BASE-4.md (rulings HP1-HP11).
- wishes.service.ts:424 with :453: the 8192 limit is on the incoming makerNote only; the stored note is the merge, so
  five PATCHes stored 48232 characters. Bound the stored note (API-BASE-3 round 2, low).
- common/validation/control-chars.pipe.ts:12-30 recurses on the body: a note nested 3000 deep answers 500 instead of
  422 (nothing is stored). Bound the depth (older than API-BASE-3, low).
- Pack fallback (TT5 path, draws with no record: none exist, nothing is live): at most one paid place can be lost on a
  refund when an unrecorded draw was really the refunded pack's. Accepted.

## Not run against the real provider
- B08 and INT-7: the Paystack refund lookup by amount, the refund, the payout and the settlement calls (stand-ins and a local
  server only).

## Cannot be given back
- Draft client wishes removed before 16 Nov's change have no window job, so they give nothing back (there are none: nothing
  is live).

## From W13's verifier (low, staff routes; for API-BASE-5)
- Erasing an erased person again answers 200; a take-down on an already removed wish answers 200; a second ban of the
  same scope is allowed: each should answer 409 with words. Staff erase is immediate (no waiting period): as ruled (FC1)?
- Staff wish search is exact (the number is case-sensitive, the email must be whole).
- From W12's builder: PUT /admin/prices has no payout-day field (R14 wants threshold and day editable); a price-book
  versions read open to finance (who and when); a state filter on the payments list and a search on businesses.

## From API-BASE-4's verifier (low; accepted or for API-BASE-5)
- A signed picture url is stateless: one given before a take-down still serves its bytes until its 10 minutes end. Accepted.
- The database's now() in notices.service.ts:216-224 and vault/reveals.service.ts:168 ignores the test clock offset
  (not on the wish path): use the Clock port there (API-BASE-5).
