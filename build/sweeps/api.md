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

## For API-BASE-9 (17 Nov, from the Vault builder; the lead rules each after the Vault check)
- A client marks favourites at the reveal link (POST at /v1/r/:code) and the business reads them (today the
  server never writes a shoot's or a client wish's hearts: UA-831, UA-976).
- A download of the finals at the reveal link (today photos only).
- Rename a shoot and a file (no PATCH; names are the server's vault-<id>.<ext>).
- A reveal from a chosen subset of a shoot's files (today every ready file in the set).
- A reveal's play sets the client wish's openedAt (UA-832: plays on the shoot).
- (API-BASE-9, product gap, HZ2 / T-12) a Concierge maker cannot make a wish in the buyer's name: "make the wish"
  on the order (the wish is the buyer's, tied to the order, hidden from the buyer until delivered), then the web:
  the maker opens the wish maker from the staff Concierge screen. Until then delivery takes wish ids by hand.
- (API-BASE-9, from the Vault check) IA1: one call that makes the client wish and the reveal together (or neither),
  idempotent; a shoot already revealed to that client answers "already sent" with the link unless asked again.
  IA4 (HIGH): copy-link after a passcode reveal returns a second link to the same files with NO passcode. A login
  of the business cannot get a Vault upload ticket ("Vault files need a business."). OWNER: a lapsed business is
  billed one whole block (₦3,000) for 210 bytes over (the website says "billed by the blocks you use that month":
  as written; say if a small overage should be free).

## For API-BASE-10 (17 Nov)
- IC7 (HIGH, the Concierge service is sold: T-12, T-13): the buyer gives photos and a voice note with the order
  (uploads tied to the order until it is delivered); the order's maker reads them and adds them to the wish; then
  the web: the buyer's order form takes the files and the maker opens the wish maker from the staff Concierge
  screen. Until then a maker can make only a words-only wish.
- OWNER: the ₦3,000 block billed for a 210-byte Vault overage (as the website says today).
- (API, suite health, 17 Nov) five specs that use test/b13-kit (api-base-4*, join4-showing, showing.contract) fail when run ALONE on this machine (503 on GET wish) and pass inside the full suite in CI: an order or environment dependence to find (Phase 7's smoke must run every spec alone once). support/tests/support.spec.ts failed once in a full run under load (text not captured).
- API-BASE-9 (second check 17 Nov, accepted by the lead): staff People's wish count still counts a Concierge wish
  being made (a staff-only view); a real account erase with a wish half made was read in code, not run; the
  migration of hearts was not run on a live-sized table; the clock and eb1 specs no longer cover the first-send
  409; a stalled-transaction comparison of the longer connection wait was not run.

## For API-BASE-11 (from W2, 22 Nov)
- A removed personal wish: restore window 30 days, then the erase job (privacy page promises it; wishes.service.remove schedules nothing). Default (lead).
- GET /v1/showing: item fields style and title at publish time; a styles filter; a public read of featured styles; public wishes by style; a public creator profile read (the web draws none of these today).
- POST /v1/support-threads/contact takes no Idempotency-Key (double-tap protection is client-side only).
- Take-down ask (E-133): hide at once or within 24 hours: WAITS for the owner.
- From WEB-API-6A (22 Nov), for API-BASE-11: (1) the keep and wake start take a per-payment return address (the link + ?reference=): today the provider's callback is one env value, so a REAL provider's return cannot land on /w/<slug> (needed before the live gate); (2) PublicWishView: a `house` flag (Report is still drawn on a house wish) and keepOffer typed; (3) a route to turn a gather link back on (only /gather/off exists).
- API-BASE-10 check (22 Nov) low: the concierge_order_file migration ships no down script (a rollback by DROP TABLE loses the order links and orphans the files).
- WEB-API-6A check (22 Nov), for API-BASE-11: no one-per-friend rule on a gather link (the same name asked twice is 201 both times; only 5 asks an hour per address and the 12 cap).
- API-BASE-10 re-check (22 Nov) lows, for API-BASE-11: a subjectId that is not a UUID at a payment start answers 500 internal_error (must be 422 in words; pre-existing); GET /wishes/<UPPER id> and GET or drop by an upper-case payment reference are 404 (IE2 on read routes); after a refund the order's stored objects go with the next sweep, not at once; extras have no 409 gate while one waits (pre-existing; a second paid extra is refund due).
- API-BASE-11A check (22 Nov) lows: `confirmation` is absent (not null) on the 24 ticket/extra/keep price lines (src/modules/price-book/price-view.ts priceOf); support_contact_key has no sweep (bounded by threads); a webhook carrying the reference in upper case answers 200 and does nothing (a real provider echoes ours).
- From WEB-API-6B (22 Nov), for the next API round: the people, payments and uploads routes take no business header (a person in two businesses cannot manage People or pay the plan for the second one from the web: the web does not draw those controls there); the stand-in never screens a logo (the "screening" state cannot be driven).
- API-BASE-11B check (22 Nov): gen_schema.py output differs from the committed schema.prisma and src/contracts (21 files; it would drop restorableUntil and type E-286's response as Wish): the committed files are hand-patched, the generator is behind (contracts:export is clean). Bring the generator back in step or retire it: a Phase 7 item. Low: a wish's erase leaves the reveal and hearts JSON on its clientWish row (pre-existing).
- API-BASE-11B re-check (22 Nov) lows: styles whose creator JSON has a handle but no creatorId (as older rows and maybe the seed's house styles wrote them) are listed under nobody by E-285: backfill creatorId once, by a migration, where the handle belonged to that account when the style was made; a published row made before a Concierge delivery goes public at delivery by itself (no route can make one; drop it at delivery to be safe).
- 22 Nov (the lead's merge run of the twelfth round, 2 workers, machine load 7-8): src/modules/pro-business/tests/api-base-8-plan-drop.spec.ts test 8 (30 drop-and-settle pairs) hit jest's 20 s limit; alone it passes (14 of 14). Not touched by the round. A test-only task: the 30-pair attack tests get a time limit that fits their work (find every `for (let i = 0; i < 30` attack test under the default limit).
- From WEB-API-9A (22 Nov), for the next API round: POST /v1/r/:code/favourites answers 200 for a mark on a removed file (the shoot then holds a heart for a file that is gone): 422 in words.
- P7-SMOKE (22 Nov) findings: PAYSTACK_PUBLIC_KEY is required to start in production but no code reads it (drop the requirement or serve it to the web's pay sheet: decide with the real-provider work, Phase 8); SCREENING_API_KEY and RENDER_CONCURRENCY are read by no code; scripts/smoke-env.mjs checks loadEnv, not a built start. THE SEED'S SOURCE HASHES: every web merge that touches lib/{catalog,levels,studio,styles,api}.ts makes prisma/seed-data/SOURCE.json stale (GD3 fails in a local run without WEB_LIB; CI skips it): after such a web merge the lead runs `WEB_REPO=/home/user/Firstwish-web node scripts/export-seed-data.mjs` in its API worktree, READS the diff (hashes only is expected) and commits it.
- API-BASE-13 checks (22 Nov), for the next API round: a kept Studio file is recognised only through the document's `art` list (src/modules/studio/submission-checks.ts:33): a file named elsewhere in a document (a poster, a sound, a 3D model, if the document names them outside `art`) would not be kept when its creator deletes it (find where each kind is named; II4 covers them all); the version migration ships no down script (dropping wish.styleSubmissionId makes every wish play the newest version); E-196 has no Cache-Control (an ETag only); E-196 for an erased creator still carries creator:{creatorId}; no 30-per-draft file limit exists on the server (the web's count is the only one).
- W14B check (23 Nov), for the next API round: GET /v1/admin/support/staff offers finance, moderator, maker and reviewer, who cannot open Support, and the hand-over to them is accepted (a thread then sits with someone who cannot read it): offer and accept only roles that can open Support; a hand-over of a thread that changed hands meanwhile answers 409 in words (today the last one wins); any role that may read payments opens any payment by its reference (by design: note only).
- WEB-API-7C re-check (23 Nov) low: a PATCH that sets a switched-off creator style by hand answers 422 "Some fields need fixing." and not the style rule's own words (the house case says the rule).
- W15C-S1 (23 Nov), for a small API task after round 17: the server holds 44 sample wishes; the web has 45 recipes: photographers / your-finals (lib/occasions.ts:276; its sample carries links.download with the sample photos) has no sample row, so its preview shows the read-failed state. Add that one row from the web's source (the table is API-owned: add it by hand through the seed file, count 45) and say why the catalogue's occasions did not list it.
- P-CI-6 (23 Nov): the cause of the hand-over failure was a read on the connection POOL from inside an open transaction that holds a row lock (role-access read in support.service.ts assign): twenty at once held every connection and the pool read timed out (503). FIXED there. OWED: an audit of every `$transaction` callback in src for a call that uses the pool (`this.prisma.` / `this.db.` or a service that does) while the transaction is open, most of all after a row lock: each either takes the tx or moves before the transaction; a parallel test for the three busiest (payment settle, wish seal, refund).
- TX-POOL audit (23 Nov, build/tasks/TX-POOL-AUDIT.md): 166 transactions read; ONE pool read inside a transaction (Concierge order start: MEDIUM) -> API-BASE-18, with pool tests for settle, seal, refund. NOT DONE, an option for the owner or a later round: a static check that fails on pool use inside a transaction callback (the audit's B3; a new gate is not the lead's to add without a ruling). Limit of the audit: a pool call reached through a variable or a dynamic call would not match its scans; it was read, not run.
- Round 19 last fix (23 Nov, lead's diff read) lows: the wishes LIST asks `videoRefunded` once for each wish whose newest job is a status video (one query a wish: fold into one read if lists get slow); GIVE_SIGNATURE in purchases/wish-rules.ts is a list of sku names (a test now fails when a new sku is unclassified); "Straße"/"STRASSE" do not match as answers (lower case, not a full case fold); 201 characters of secret give generic 422 words. The last fix round's builder could NOT run the full suite (its session was refused that command twice): the full suite on that head ran in the lead's own merge check (m38).
- W16 (23 Nov) request from the web: on a kind or occasion MOVE that sends no style the server picks none and refuses the save; it should pick one (as it does for a new draft), so the web's `moving` fallback in lib/offers.ts can go.
- API-BASE-18 check (23 Nov) lows: the seal pool test pins the losers' refusal to "409:not_allowed"; Concierge place() makes an unpaid brief with no idempotency key and no cap on open briefs per account (listed to the owner).
- WEB-10B (23 Nov) requests from the web, for server round 20: (a) the wish read never sends what the wish holds (`adds`: wishes.service.ts:294), so the wish page asks GET /payments to learn an extra was bought, and the maker's `held.adds` is always empty, so the maker re-offers five more photos and the premium style to a wish that has them (the start is refused for the video; CHECK the others: a second charge would be HIGH); (b) GET /v1/ticket-offers is business-only (a person gets 403), so a person's ticket step learns "not sold" only when the payment start refuses; (c) after an extra's refund is sent nothing on the wish read says so (only the ask's 402 or the video's 404).
- R1 (23 Nov) lows accepted at its last round: RENDER_LEASE_MS's default is 20.5 minutes beside the one lease rule (kept so older assertions hold: fold into the rule in R6); the erase poll reads every 5 s for each running render; a direct run() (not the job path) still waits for a place; attempts reset after a busy return (R6 counts losses on the row).
- Round 21 check (23 Nov), accepted or noted: the stand-in clip reader believes the file's header and reads only 1 MB (a lying header passes on stand-in stacks; the real ffprobe reads the content); three unconfirmed clip uploads hold a paying person's three places for 15 minutes (DELETE /v1/uploads/:id frees one at once): if abused, shorten the hold or count holds per account.
- OPEN after round 21 (23 Nov): Wish.limits is on the owner's wish reads but NOT in the registry (the patch agent's session was refused the reopen commands; not done by anyone since; DEC-325 says the registry was not reopened). Needs ONE additive reopen (extraFields row in tools/pipeline/routes.json, a DEC pair, reconcile, freeze, contracts:export) before the web may read it. Surfaced to the owner.
- Round 21 re-check (23 Nov) lows: an old clip with no stored length is probed once for each parallel reader, and an unreadable one on every read (wish-clips.ts fillClipLengths: read once, remember "unreadable"); when the count is over AND a clip is too long the words name only the count (the long clip is named once the count fits). A seal or offers read of a wish holding an old clip while the length tool is down answers 503 (the clip is kept).
- R3 (24 Nov) note: its session did the registry reopen for its own route with no refusal (E-289, DEC-326, DEC-327), so the refusal round 21's patch met was not a general block; Wish.limits is still not in the registry (owner asked on 23 Nov). A possible random failure seen once in its full runs: api-base-5-staff (a payments list page of 50 crowded by other specs' rows in the shared test database): the R3 verifier is asked to pin it down; if real, it wants the P-CI-7 treatment (its own database).
- R3B check (24 Nov) lows, test stacks only: the stand-in's token file keeps a looser mode when it already exists (0600 applies on create only: video-renderer.ts:105) and a symlink at its path is followed. The harness (stack.mjs) should make the file itself, fresh, for each stack.
- R3C (24 Nov): .pipeline/declared/video-render.json still says videoRender.statusMaxSeconds 30 and DEC-56 says 30; the code and ruling IK6a say 60. Put both right in the next registry reopen (not done here: no reopen for a number).
- API-22 check (24 Nov) L2: sharp-image-sizes.adapter.ts:51-58 would size an SVG sent as image/png; unreachable today (finishConfirm refuses SVG by signature first).
- API-22 check: ab21-clips and ab21b-clips fail (5 tests, ticket start 409) when run beside the ports, stored-files and staff-reads folders, on the base too; the shared row not pinned: a small test-only task (their own database).
- API-22 check: readObject on the real store unproven (no bucket here); non-404 errors rethrown raw.
- R5 hand-back (24 Nov): playwright-core is not in package.json (R6 adds it); the clock by a path on disk (IK6c: the web serves it; R6).
- API-23 check (24 Nov) LOW: a 16-bit PNG comes out 8-bit and an APNG is flattened, with no words; studio-files.service.ts:40 and pro-business.service.ts:101 do not catch the legacy-HEIC 404 (one old uncleanable file 404s the whole read; no such row exists); a second confirm of a clean JPEG re-encodes it.
- API-23 check: not fetched by anyone at the bytes: feed cover, friend on a group wish, business client read, wish video download, data export (read in code only: all through SignedUrlsService): do it in Phase 7's smoke.
- P-CI-10 (24 Nov) LOW: files-kit.ts re-computes scripts/seed.mjs's seedId by hand (a second copy of that rule: if the seed's id rule changes the kit makes a second row again): share one helper.
- (R6, IK3b) RenderJob has no wire field for the failure words: the owner's screen shows the generic failed state; words only on the row and staff read.
- (R6, IK3b) the video maker's deep check has no HTTP route; the staff page shows only the cheap check.
- (R6 LOW-2) RENDER_RETRY_MS is read nowhere and its comment is wrong (a plain failure is final at once): remove or wire.
- (R6 LOW-3) render read: isKnown() reads the database before the address limit, so wrong tokens are limited at 60 a minute, not 30.
- (R6 re-check LOW) tests/r6-worker.spec.ts:142 `removed >= 1` is loose: assert exactly 1, the old .mp4 gone, the live folder kept.
- (R6 re-check LOW) a SIGTERM'd render worker leaves its row rendering until the lease runs out (no graceful release on shutdown).
- (IK6k) r5-chromium-renderer.spec.ts M3 fails under load (16 of ~90 frames differ at load 8 to 10): for the recorder follow-up after W19.
- (R7 L1) erase nulls RenderJob.outputFileId but keeps the row (file-jobs.ts:319, wish-lifecycle.service.ts:403); the plan says the row goes too (no letter text in it).
- (R7 L2) a refunded video's file stays stored until the wish or account is erased; an address issued before the refund serves up to 10 minutes.
- IK6l: the recorder's first recording after a web start can differ in every frame from the next one (1 of 16 cold letter pairs; one text line 1/64 px wider). Invisible; a candidate fix: the worker opens the render page once at its start.
- R5F re-check LOW: the world-remade path in realFrames (chromium-video-renderer.ts:862-870) has no test; the log text says "400 ms" even when frameWaitCapMs differs (:933); numbers.md cites the flag at :682 (it is :687).
