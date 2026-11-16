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

## For API-BASE-6 (16 Nov: handed back by API-BASE-5 and found by W8's verifier)
- Handed back by API-BASE-5: typed staff reads (its case 6); keep and wake by link for a receiver (case 8); house
  showcase wishes per style (case 9: the seed has 43 house styles and no house wish); ending-purposes display name
  and line; a friend adding a voice through the gather link (needs the flow ruled).
- HR1: the plan read says, per plan on offer, what a payment now would do (adds a month to which day; replaces the
  live plan and what becomes of paid time); a second plan start while one is pending is 409 with words.
- HR3: /me carries the businesses the person is a login of (and the role); a removed login's reads answer with words.
- HR4: the removed draft's read (or the client-wish list) gives the day its wish returns to the pack.
- HR5: the people import answers per row (accepted, refused with the field and words); a phone that is not one is
  refused, not stored blank; the same person twice is reported.
- A read address for a brand logo (brand.logo is a file id): a signed read like the wish's pictures.
- The payments module writes a `reason` on a failed payment (the web shows its own words today).
- Contract: GET /business/plan (E-27) is typed NoContent though it answers the plan state.

## After API-BASE-5 (verified twice, merged 16 Nov)
- Closed by it: the stand-in put and AI shape (HQ3), the maker's fields (HQ1), the gather link read for the owner
  (HQ4), styles by ticket on PATCH and on every seal path (HQ5), the payout day, the price-book versions read, the
  payments state filter, the businesses search, erase of an erased person 409, the Clock port in notices and reveals,
  the voice-note limit (12). The staff lines above under "From W13's verifier" are closed or were stale.
- Open, low: api-base-5-seal-style.spec.ts lowers the price book's Signature styleLevel for about a second in two
  tests (shared by every spec in the run; no spec fails today): give those tests their own price-book version or run
  them alone. A settled premium-style extra on a draft with no ticket is not attached until a ticket is (a UI note for
  W6). A draft's gather link answers 404 until the wish is sealed. A put to a landed key answers 409 before the
  signature check (test stacks only).
