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

## For API-BASE-7 (16 Nov)
- Typed staff reads (handed back twice: API-BASE-5 case 6, API-BASE-6 case 6).
- A sweep for an upload that was confirmed but never attached to a wish, a brand or a shoot (today only unconfirmed
  uploads are swept after 24 h).
- The price book serves the Concierge delivery hours (the code uses 3; the field says 0), the erase-now period and
  the photo limit (the website's restored sentences read them).
- OWNER asked: reactions for every ticket (as the API does) or Keepsake and above (as the product document says).
- Per-action role reads for the staff wish, person, payout and numbers-target actions (the web keeps ACTION_ROLES).
- (API-BASE-7) No receipt email is sent after any payment (owner or link holder): R11 says every message goes by
  email: a receipt after a settled payment, to the account's email or the payer's email on the payment (default
  (lead): yes; a template the staff Messages screen lists).
- (API-BASE-7, from W10's builder) Studio files: a signed read address for a studio file, and POST /uploads taking a
  DRAFT's styleId (today "No such style"); upload purposes for sound, a 3D model, a poster and a creator's profile
  picture; a route to turn Signed off or move a style to Open; the payout threshold and day in the price-book read
  with their provisional mark (R14); GET /v1/wishes carries `publish` (today only the detail does).
- API-BASE-7 (check 16 Nov, lows): the player's style-files read answers for a live wish past its end day and for a
  passcode-locked wish (an approved style's files are catalogue assets: accepted); a link payer whose payment is
  marked refund due still gets the "paid" receipt and the refund notice only when the refund runs; a failed receipt
  is retried by a queued job (not timed in the check). Not run: a payout run either side of a moved threshold.
- API-BASE-7 (second check 16 Nov, accepted by the lead): a book version does not hold its own limits (the read
  always serves the one current row; the audit carries each change's old and new value); an erased creator's live
  style row still carries the account id (existing T-62 behaviour: check against the erase rule in Phase 7); the
  refusal's per-field words for a bad limit were not read; PATCH signed:false after the backfill not run end to end.
- (API) P-CI-275's fix scopes the 'ledger untouched by the switch' counts to rows linked to the account's payments: a ledger row the switch wrote with no payment would not be seen (the second check's own probe saw the ledger not move): tighten in Phase 7 if a ledger-wide per-test window is added.

## For API-BASE-8 (16 Nov)
- HY1: a route for the owner to drop a pending plan payment at once (abandoned; a late "paid" follows HU6); the plan
  read says when a pending payment lapses. Found by the Business patch: a login's unpaid plan start blocks the
  owner's next start for up to 60 minutes.
- (API-BASE-8, from W14's builder) a staff list a support member may read for a thread hand-over (today /admin/team
  is owner-only); the Concierge order wire carries its payment's id and reference; a read giving a maker the
  buyer's wish ids for an order (delivery takes wish ids); "refuse" a style submission has no route (decide takes
  approve or return): the lead rules after the check says whether the design draws it.
- (API-BASE-8, from the Business Plan check) the owner cannot read a plan payment a LOGIN started (GET
  /payments/{ref} is 404 for the owner, 200 for the login): everyone who may pay for the business's plan reads the
  business's plan payments; the plan read's `pending` carries when it lapses (lapsesAt).
- (API-BASE-8, from the Staff support check) the designed staff screens had "Find a thread" (Support) and "Find an
  order" (Concierge): the lists take no search word, so the wired screens dropped both: a `q` on each list. The
  Concierge order carries its payment's provider reference (the refund link can then open that payment).
