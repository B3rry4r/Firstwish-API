# Phase 3 rulings on conflicts.json (15 Nov 2026). Every line: Default (lead), owner may override, unless it cites an owner ruling (R..).
None of these is one of the six owner cases. They are listed to the owner, not asked.

## Same thing or not
C-1  same: one resource PublishedWish (house wishes are seeded rows); read by GET /v1/showing (S-16).
C-2  different: PublicWishView is what the public link returns; its `content` is typed WishData.
C-3  two records, ONE action: StudioStyle (the document) and StyleSubmission (its review). SubmittedStyle is a read view of a live StudioStyle
     with its submission. One submit endpoint: POST /v1/studio/styles/:id/submissions.
C-4  same: one credit balance, on the creator (CreatorState.credits). A sender's AI writing uses no credits (a daily cap).
C-5  same: Earnings is a read view over RoyaltyAccrual (GET /v1/creator/earnings).
C-6  same: FeedStyle is Style. C-7 different: StyleManifest stays in the web app; the server's Style holds slug, level, on/off, creator, counts.
C-8, C-9  same: one LifecycleConfig, served inside the public price book (GET /v1/price-book).
C-10 same: a price-book line (concierge.single). C-11 same: ProPlan. C-12, C-13: kinds and occasions stay in the web app; not a resource.
C-14 same: a reveal sent from a shoot is a ClientWish carrying its shootId.
C-15 same, and it stays in the web app (recorded files under public/previews).
C-16 different: Creator (public profile, 1:1 with an Account); the feed's Creator is Creator's public view.
C-17 same: DateRow.
## Fields
C-18 same: styleId. C-23 same: fileId. C-30 same: `style` (a house slug or `studio:<id>`). C-31 same: wishId.
C-21 one field, amountKobo, set by the server only. The client never sends an amount; the app-wish-detail amount is dropped (supersede).
C-22 one field, wishIds: string[] (a single card is a list of one). C-25 different: `event` is the provider's event name, `eventId` its id (dedupe key).
C-19 object (values keyed by field key; the list of field definitions stays in the web app). C-20 array. C-27 object.
C-24, C-26, C-32, C-33  time, ISO-8601 UTC on the wire (new supersede: every epoch-ms `at` becomes createdAt/updatedAt ISO strings).
C-28 one field: keep: null | "month" | "half" | "year". The maker's boolean is stale (supersede; a ui-align task).
C-29 a calendar date string YYYY-MM-DD (not a timestamp); add "date-only" to the format canon in conventions.md.
## Money
C-34 not a new figure: ₦80,000 = 100 wishes x the ₦800 royalty at list (T-65). The page works it out from the served price book and never
     types it (ui-align task). Listed to the owner.
C-66, C-67 build it: every price-book line has a fulfilment handler that runs on a verified payment (webhook): pro.starter starts the plan,
     pro.pack adds its wishes and space. Reads: GET /v1/business/plan. Tests: pay -> plan active; pay -> pack added; replayed webhook adds nothing.
## Stays in the page (navigation, clipboard, share sheet only; R10: never a browser store) or needs the server
C-35, C-44, C-45, C-46 navigation only (a choice travels in the link). C-38 share sheet only (the link comes from the server). C-41, C-42 clipboard only.
C-36 server: PATCH /v1/wishes/:id (the draft's style). C-39 server: POST /v1/wishes/:id/seal. C-40 server: PATCH /v1/wishes/:id.
C-43 server: POST /v1/wishes/:id/wake (after its payment). C-47 server: POST /v1/payments with the Pass line; the grant by its fulfilment handler.
C-37 split into: share (C-38), buy a keep and wake (payments + wake), ask for the video (POST /v1/wishes/:id/video), ask to publish
     (POST /v1/wishes/:id/publish-requests); each maps to the endpoint its declaration already has.
## Served or kept in the web app
Served (public, cacheable) because staff can change them or they are money: every price, term, limit and the date the 40% off ends, in
GET /v1/price-book: C-49, C-50, C-53 (its numbers), C-55, C-56 (its numbers), C-57, C-62, C-63. C-59 served (GET /v1/showing).
C-60 worked out in the page from GET /v1/styles/levels. Kept in the web app (wording and files only): C-48, C-51, C-52, C-54, C-58, C-61.
## Who may read
C-64 no public read of an account. Sign-in reads nothing about an account before it is proved (no way to test whether an email has an
     account). Signed-in screens use GET /v1/me. A creator's public page is GET /v1/creators/:handle.
C-65 GET /v1/wishes/:id is the owner's (and staff). A receiver reads GET /v1/w/:slug, where the server decides what a sealed wish shows.
## Also
"internal" is a fifth auth class: a job or port with no HTTP route.
## Owner rulings of 15 Nov to apply to the inputs (build/rulings.md has the words)
R10 new supersede: every read or write of localStorage/sessionStorage/IndexedDB in the web app is replaced by its endpoint; the session is an
    httpOnly refresh cookie plus an in-memory access token; mode (light/dark) is a field on the account; choices before sign-in travel in the link.
    A gate task: the build fails on those three words in app/, components/, lib/.
R11 new supersede: sign-in by phone is removed (email code or Google); phone is a plain optional detail, never verified, never an account key.
    declared messages-sms and messages-whatsapp: status "deferred-by-owner" (no adapter, no endpoints, no env vars); every notice goes by email.
R12 the email adapter is Resend (RESEND_API_KEY, MAIL_FROM in env-manifest). R13 no transcription provider or env var; dictation is the
    browser's; the AI gets text only. R14 payout threshold 500000 kobo, monthly on the 5th, PROVISIONAL, a price-book line staff can change
    (replaces the open item on T-64). R15 contact details are set (STUB-22, STUB-168: resolved, implemented in lib/config.ts).
## Round 2 leftovers (15 Nov, 16:20)
C-20 (round 2) QrCard.wishIds is string[] only (DEC-109). C-21 (round 2) StoredFile.fileId is a string id; bytes go straight to storage by a
signed upload, never through the API (DEC-110). The public price route is GET /v1/price-book (DEC-111).

## Admin screens joined (15 Nov, evening). Every line: Default (lead), owner may override, unless it cites R..
The 23 admin fragments (.pipeline/fragments/admin-*.json) are in; scan-map.json holds their entries (89 screens).
A1  Every staff request lives under /v1/admin, with auth "staff role" and the roles from the Team access table (lib/admin/d-fixtures.ts
    in the web repo): the server enforces it on every route; the page's own hiding is not protection. Where a seam header names its
    /v1/admin request, that route is used (tools/pipeline/routes.json). The one exception named by a reader, PUT /v1/styles/levels/:slug,
    becomes PUT /v1/admin/styles/:slug/level (the public read stays GET /v1/styles/levels).
A2  Admin entity names with a note in brackets ("Wish (list row)", "Person (as used here: ...)", "Payment (single) with its record",
    "Order (row)", "Business (single)", "AuditRow (unfiltered ...)", "Due (this week)", "Submission (count only)", "PriceChange (audit
    entries ...)") are staff VIEWS of the resource named before the bracket, not new resources: Wish, Person = Account, Payment,
    Order = ConciergeOrder, Business, AuditRow = AuditEntry, Due = a read over ConciergeOrder, Submission = StyleSubmission,
    PriceChange = PriceBookVersion's change record. Member = StaffAccount. ModView = Report / flagged StoredFile / takedown request.
    PublishView and Listed = PublishedWish and its request. StyleRow = Style. CreatorRow = Creator. PayoutRun, PayoutRow = Payout.
    Thread = SupportThread. Template = the Notice wording. Message = MessageDelivery. Numbers, Overview = reads worked out by the server.
A3  Sample figures in admin fixtures (lib/admin-fixtures.ts, lib/admin/*-fixtures.ts) are sample data, not prices: the money truth check
    skips them (closes the ₦17 and ₦7,000 rows). Price.list and Price.listKobo are one field, listKobo.
A4  Hyphenated action names ('assign-maker', 'set-price') are single actions (the parser accepts hyphens).
A5  GET /v1/payments/:reference is the payer's own (user:owner); staff read GET /v1/admin/payments/:reference; nothing about a payment is public.
A6  An audit row's actor is a staff id (name joined on read); every staff action writes one, in the same transaction as the change.
A7  The server decides which actions a wish, person, payment or order offers (the response carries `actions`); it masks phone and
    email for staff (the full value only with a reason, audited).
A8  Staff sign-in: a code to an email that is already a staff member in Team; no self sign-up; staff refresh life 12 h (as declared).
A9  A maker sees only the Concierge orders given to them; owner and ops see all. Ops may read Prices; only owner and finance change them.
A10 A price change carries typed old and new values in kobo and takes effect as a new price-book version; the 40% and its end date
    live in the price book's Promotion, never a page constant. The payout threshold is a price-book setting (R14).
A11 A refund goes through the payments port and reads "Refund started" until the provider's webhook confirms it; the ledger's provider
    side comes from a daily settlement job; differences are rows staff can see, never auto-corrected.
A12 Numbers' targets are a staff-set setting (none set -> "No target set"); thread counts are their own read; a reply really sends an
    email; an inbound email (the email provider's inbound webhook, signature checked) opens or reopens a thread.
A13 Style use counts (previews, paid uses) are written by events from the app (a preview played, a wish paid in that style), never
    invented; a wish records the style it was made in (Wish.style). Automatic checks on a submitted style run in the page and are
    re-run by the reviewer's page; the server stores the result with who ran it (it cannot run a browser check itself).

## Admin join, leftovers (15 Nov, later). Default (lead), owner may override.
A14 Every /v1/admin request that changes something carries `reason` (string, 4 or more characters), written to the audit row. This
    includes the declared ones that lacked it (staff accounts patch and suspend, concierge delivery and quote, job retry, payout-run
    approve, price-book version create and publish, reconciliations, refund approve, screening decision, support assignee). Only the
    staff sign-in routes (code, verify, sign-out) take none; code and verify are public by nature (before sign-in), rate-limited.
A15 Account.pass is an object or null: {active: boolean, endsAt: time}. A staff list's boolean is `pass.active`.
A16 Account.sides is an array of enum(person|creator|business); each side's details live on Creator and Business.
A17 ConciergeOrder.from is a string (who ordered). "Due this week" is a read over ConciergeOrder with query parameters `from` and `to`
    (date-only); the window is not a field of the order.
A18 Same field: ConciergeOrder.maker = makerId; Payout.creator = creatorId; Report.wish = wishId. Different: Report.decided is the
    decision taken (enum), Report.decidedAt is when.
A19 Endpoints the rulings ask for and no screen names are built: GET /v1/admin/support/counts, POST /v1/webhooks/email/inbound
    (signature checked), a daily settlement job (internal), PUT /v1/admin/numbers/targets (owner, finance; reason), and
    POST /v1/admin/people/:id/contact-reveal (reason; audited; returns the full phone and email once).

## Registry reopened once, from the schema's halts (15 Nov, night). Default (lead), owner may override, unless it cites R..
P1 (HALT-1) PUT /v1/admin/numbers/targets body: {line: enum(tickets|extras|keeps|pass|pro_plans|vault_space|concierge|creator_plans),
   period: "month", targetKobo: integer kobo, reason}. Stored as a config table NumbersTarget (line, period, targetKobo, setBy, setAt);
   Numbers stays a view that reads it; no target set -> the line's target is null ("No target set").
P2 (HALT-2) WebhookEvent does not link to Event: WebhookEvent.eventId is the provider's event id (string, unique with provider). The
   dep-graph edge is dropped.
P3 E-87 (and any other payment start): the body carries no amount or price; the server prices from the price book (S-24). The optional
   client fields are removed from the contract.
P4 E-19 (ask for a sign-in code): the only channel is email (R11); `channel` is removed from the body (or is enum(email) if a later
   ruling adds one). The same for any contract still naming sms or whatsapp as something Firstwish sends.

## Registry reopened a second time, from the schema's verifier (15 Nov). Default (lead), owner may override, unless it cites R..
Q1  Account.mode: enum(light|dark|system), default system, read and set through /v1/me (DEC-103, R10). Added to the registry.
Q2  Money on the wire is a JSON integer (kobo). One serialiser turns every BigInt into a number and refuses (500, logged) a value
    past the safe integer range; no route returns a raw BigInt. A test proves a response with money serialises.
Q3  E-124 (change a price): body {sku, priceKobo?: kobo, listKobo?: kobo, promotionEndsAt?: time, reason}; at least one of the three.
    The old untyped `value` is removed.
Q4  Calendar dates are DATE columns (ruling C-29): date_row.date, person.birthday, person.start, shoot.date, client_wish.day, and any other date-only field.
Q5  Nothing may be granted twice. Uniques: payout (creatorId, month) and payout.providerReference; royalty_accrual (paymentId,
    creatorId); pass_membership.paymentId; creator_state.accountId; refund.providerReference. Columns: payment.fulfilledAt (set once);
    pass_membership.state and paymentId; `version` integer on every row a counter lives on (business usage, creator_state, vault
    storage, pass_membership, wish). CHECK constraints: every kobo amount >= 0; credits, reviews, wishes used, bytes used >= 0.
Q6  Refund body: amountKobo is kobo (positive, at most the payment's amount, checked in the service), reason 4 or more characters.
Q7  Email and handle are unique without regard to case (stored lowercased AND a unique index on lower(...)). One handle namespace:
    the handle lives on Account; Creator reads it (no second handle column).
Q8  The wish link: slug varchar(32), issued by the server. The passcode is never in the content JSON: Wish.passcodeHash (hashed),
    with tries and lockedUntil on the link (E-134 counts them). The receiver's read never returns the passcode or its hash.
Q9  Erase: Account.erasedAt; schema-map.json gains, for every column outside Account that holds personal data, an `erase` rule
    (blank | keep, with the reason, for example a ledger row keeps its amount and loses nothing personal). Audit rows hold ids and the
    names of changed fields, never personal values; so audit never needs blanking and stays append-only (UPDATE and DELETE refused).
Q10 Every id column that points at another table is a uuid with a foreign key and an index (support_message.threadId and the staff
    and owner id columns the verifier listed). Ledger foreign keys are ON DELETE RESTRICT.
Q11 The 9 config tables with no writer and no seed are seeded from the constants the web app holds today, through ONE export script
    in the API repo that reads the web repo's files (named in schema-map), so their GETs are never empty; staff editing them is not
    built (no screen asks).
Q12 Every payment start returns {payment: {reference, state, amountKobo, authorizationUrl}} beside what it buys; an endpoint whose
    registry response is null answers 204 with no body, stated in its contract.
Q13 (K1, R11) Sign-in is by email only: AuthCodeVia is email only, the purpose confirm-phone is removed, E-19's contact is an email.
Q14 Loose contract types are fixed where the verifier named them (NumbersTarget.targetKobo is kobo; Price.kind is its enum).

## From B03's halts (15 Nov). Default (lead), owner may override. To be applied in ONE reopen together with B01's halts, if any.
S1 Kernel: one composite token verifier in src/common: a token with audience "staff" is checked by the staff verifier, any other by
   the user verifier, and each refuses the other's audience. (A kernel task after B01 and B03 are both merged.)
S2 audit_entry gains `section` and `reason` columns (the contract has them). A reason is staff-written text and is kept; staff are
   told on the sheet not to put a customer's details in it (Q9 stands for the changed values).
S3 StaffAccountStatus gains `removed` (a removed member is kept for the audit trail, cannot sign in, has no roles).
S4 E-18 (GET /v1/admin/audit): query gains `section`; roles are owner and ops only (A1).
S5 Staff refresh: POST /v1/admin/auth/refresh (by the staff cookie; rotates it; 12 h life; a reused old cookie ends the session).
   E-176's response is {staff: StaffAccount, accessToken, accessTokenExpiresAt}.
S6 E-174 always answers the same (204) whoever asks; the registry note "refuse not_staff" is wrong and is removed. An invited member
   gets a code (that is how they first sign in) and becomes active on their first verify.

## From B01's halts (15 Nov). Default (lead), owner may override. Applied in the same reopen as S1 to S6.
T1 E-20 (verify a code), E-53 (Google callback) and E-159 (refresh) answer AuthResult: {accessToken, accessExpiresAt, isNew,
   session: {id, expiresAt}}; the refresh token is only ever in the httpOnly cookie; no response carries a token hash.
T2 E-54 (start Google) answers {url}.
T3 E-159 (refresh) is public by its cookie (no bearer): its auth in the registry is "cookie".
T4 A rotated refresh token used again ends that session family only (that device's chain); other devices stay signed in.
   conventions.md is corrected to say so.
T5 Kernel: the Google identity port, its real adapter and stand-in move to src/common/ports; the access-token issuer and verifier
   move to src/common/auth and are bound in CommonModule (one verifier for user and staff tokens: S1).
T6 Test kit: the stand-in id generator must give ids that never repeat across test apps sharing one database.

## From Verify B03 (15 Nov): how each finding is closed. Default (lead), owner may override. The same rules bind B01's sign-in.
U1 (high) Tries are counted atomically: one UPDATE that adds a try only while tries are under the limit, and the code is compared
   only if that UPDATE took a row. 10 wrong and 1 right sent at once: at most 5 are looked at.
U2 (high) Limits never depend on Redis: codes asked per email and per address are counted in the database (the auth_code rows in the
   window). A new code does not give a fresh budget of guesses: wrong tries are also capped per email per hour (15, PROVISIONAL)
   across codes. If the database cannot answer, the request is refused (503), never let through.
U3 (medium) A unique violation on invite answers 409 already_staff, never 500.
U4 (medium) Asking for a code takes the same time whoever asks: the answer is sent before any email work (the send is queued), and
   the same hashing work is done for a stranger. A test compares the two medians (20 each) and fails above 2 ms apart.
U5 (medium) A removed member can be invited again: they return as invited with the new role; one audit row.
U6 (low) `reason` is 4 to 500 characters everywhere. U7 (low) A staff account can never be deleted at the database (a trigger).
U8 (kit) `npm run test:affected -- <directory>` runs the specs under that directory.

## From Verify B01 (15 Nov): how each finding is closed. Default (lead), owner may override. V1, V2 bind staff sessions too.
V1 (medium) An access token names its session FAMILY and is good while that family lives: rotating the refresh token does not kill
   the access tokens already given (a second tab and parallel requests keep working). Sign-out and theft still kill at once.
V2 (medium) Refresh has a grace of 10 seconds: the same rotated token sent again inside it gets the SAME new child (one rotation,
   many identical answers), never a 401 and never a cleared cookie. After the grace a reused old token ends the family (T4).
   6 refreshes at once with one cookie: 6 successes, one live child.
V3 (medium) The Google state is bound to the browser that started it: start sets an httpOnly, Secure, SameSite=Lax cookie scoped to
   the Google routes holding a nonce; the callback refuses a state whose nonce cookie is missing or different.
V4 (low) The client address: the number of trusted proxy hops is an env setting (TRUST_PROXY_HOPS, default 0); the address is read
   accordingly, never the raw last X-Forwarded-For when 0. README says what to set behind DigitalOcean's load balancer.
V5 (low) Per-email limits count on a canonical form (the +tag dropped; the account's email stays as typed).
V6 (low) Ids in tokens and paths that are not uuids answer 401 or 404 in the envelope, never 500.
V7 (low) No Date.now() outside the clock port (Google adapter). V8 (low) Reserved handles also include api, root, settings, staff,
   moderator, wish, w, v1, me, sign-in, sign-up, pricing, terms, privacy, contact.
V9 (low) Verifying a code is also limited per address (60 an hour, PROVISIONAL).
Not changed (sweep): an old code sent after a new one costs the new code a try.

## Wiring and deployment rules that fall out of the identity work (15 Nov). Default (lead), owner may override.
W1 The web app reaches the API on its own origin: Next.js rewrites /v1/:path* to the API host (API_ORIGIN, server-side env). The
   sign-in cookies are therefore first-party, there is no cross-site request from the page, and CORS stays a short allowlist for
   local work only. (Phase 6 builds the rewrite; the API host can then sit anywhere, DigitalOcean included.)
W2 Routes that act on a cookie alone (both refresh routes, both sign-outs when sent without a bearer) refuse a request whose Origin
   header is present and not on the allowlist (403, envelope). SameSite=Lax stays as the first guard.

## Wave 2 halts (B14, B04, B09, B02): collected for ONE reopen (task INT-2). Default (lead), owner may override.
X1 (B14) Style.rate is number or null (null under 200 previews in the quarter).
X2 (B14) E-193 (staff list of styles) query gains `level`.
X3 (B14) StyleRate (E-199) is {styleSlug, name, level, quarter, previews, paid, rate}.
X4 (B14) Event gains a `key` column, unique with name and account (a replay counts once), and an index on (styleSlug, name, at).
X5 (B14, for Phase 6) the web app's lib/levels.ts follows the contract: the paged levels read and PUT /v1/admin/styles/:slug/level.
X6 (B02) GET /v1/creators/:handle (public) is added: a creator's public page (public fields only; one 404 for missing, side off,
   banned or erased).
X7 (B02) Erase on request: POST /v1/me/erase (signed in; a sign-in younger than 10 minutes, else 403 fresh_sign_in_needed; body
   {confirm: "erase"}; answers 204 and ends every session). It calls the erase service B02 built.
X8 (B02) The house is a seeded account with a creator side and the reserved handle "firstwish" (no email, cannot sign in), so house
   styles and wishes have an owner and the creators list includes it.
X9 (B02) published_wish.wishId is a uuid with a foreign key to wish.
X10 (B02) Erasing an account also removes its stored files (a job through the storage port, after the transaction) and its wishes'
   public links answer "gone"; B09 and B10 each do their part; INT-2 joins the erase service to the files job.
X11 (B02) E-5 (is this handle free?) needs a signed-in user, not the creator side.
X12 (B02) Business keeps the registry's fields; "kind" in the B02 brief was the lead's slip.
X13 (B04) E-213 (ticket offer) takes `ticket` and repeatable `extras` and answers ONE quote: lines in kobo, total, the version used.
X14 (B04) The public price book's response is {version, items: Price[], promotion|null, lifecycle, entitlements, nextCursor}.
X15 (B04) Price.value is kobo for kind naira and an ISO time for kind date; fields that belong to other screens are optional.
X16 (B04) Ops may read /admin/prices (the role table gains it, read only); only owner and finance change a price (A9).
X17 (B04) The offer's end can be moved sooner, never later (product truth T-26: the offer is not extended). Listed to the owner.
X18 (B04, Phase 6) The admin Prices screen uses the keys promotion.endsAt and payout.thresholdKobo.
X19 (B04) A change of the payout threshold made by the owner role clears its PROVISIONAL mark.
X20 (B09) E-182 answers UploadTicket {id, purpose, upload: {url, method, headers, expiresAt}}; E-183 answers 204; SignedUrl is
    {url, expiresAt}.
X21 (B09) The screening port's result carries score (0 to 1) and labels.
X22 (B09) The image-sizes port moves to the kernel; its real adapter (resize with sharp, read and write through the storage port)
    is built in the wave that merges the jobs frame (B06), where the job that calls it runs.
X23 (B09) Every *FileId column is a uuid with a real foreign key to stored_file (schema change in INT-2; the triggers go).
X24 (B09) Staff read the screening queue at GET /v1/admin/screening-results (owner, ops, moderator), feeding Moderation's flagged photos.
X25 (B09) StoredFile.kind stays the media kind (image|sound|model|video); E-182's body gains `purpose` (photo|voice|clip|vault|studio).
X26 (B09, kernel) A signed upload binds the content length; the stand-in token generator is random where it makes storage keys.
X27 (B09) Vault files are read by the business's owner AND its logins (members), never by anyone else.
X28 (Verify B14, low) The public levels read returns every style in ONE answer (no paging: there are tens, not thousands) and its
    ETag covers the whole answer.
X29 (Verify B14, low) An event for a style that is switched off is refused (422), not counted.

## From Verify B09 (15 Nov): how each finding is closed. Default (lead), owner may override.
Y1 (high) An upload lands on a staging key (incoming/...). On confirm the server copies it to its final key, which no signed PUT
   ever pointed at, and removes the staging object. The signed PUT binds content type and length (X26). So nothing the owner sends
   after confirm can change a screened file or dodge the Vault count; stray staging objects are removed by the cleanup job.
Y2 (medium) The file-link triggers are replaced by real foreign keys (X23); no trigger fires on unrelated updates.
Y3 (low) At confirm the server reads the file's first bytes and decides the type itself (the storage header is not trusted); an
   SVG is not accepted as a photo; the stored size is the real size.
Y4 (low) Storage calls happen outside the database transaction: the upload row is claimed in one conditional UPDATE, storage is
   read, then a short transaction finishes it.
Y5 (low, for B06) The files a wish names live in a join table with foreign keys (wish, file, role), written when the content is
   saved, so a file in a sealed wish cannot be deleted by any race.

## From Verify B04 (15 Nov): how each finding is closed. Default (lead), owner may override.
Z1 (medium) A staff price change always takes effect now. A version dated in the future is not offered (no screen asks for it):
   a draft with a future start is refused (422), so nothing can silently hold back later changes.
Z2 (medium) concierge.rush is removed from the seed: it is in no web app file, and by R5 the app is the truth for what is sold.
   Listed to the owner (it can be added as a price line when the app sells it).
Z3 (low) A change that changes nothing answers 409 not_allowed ("That is the price now") and writes no version and no audit row.
Z4 (low) Changing a line's list price never rewrites its price-now; each is changed only when the request names it.

## From Verify B02 (15 Nov): how each finding is closed. Default (lead), owner may override. AA1 to AA4 bind EVERY bundle.
AA1 (high) Nothing can be written to an account after it is erased. One kernel helper locks the account row and checks erasedAt
    INSIDE the transaction; every write that belongs to an account (profile, handle, sides, follow, brand, and later wishes,
    files, dates) goes through it; erase takes the same lock. Tests race erase against each write, 10 times each.
AA2 (high) Erase rules are complete and enforced by a gate: schema-map.json carries blank or keep (with the reason) for EVERY
    text and json column of every table that has an owner key, and scripts/check-contracts.mjs fails when one has none. Added now:
    business.business, business.name, business.brand, date_row.what (all blank).
AA3 (medium) Text with a NUL byte or other control characters (tab and newline aside) is refused with 422 by one global check,
    never a 500.
AA4 (medium) A link is stored as the parsed URL's own text (new URL(v).href), https only, at most 2048 characters.
AA5 (low) A brand logo is a stored file (purpose "brand", through the files bundle: screened, typed by its bytes, no SVG), not a
    data URL. Free text is stored as typed and is always shown as text by the web app, never as HTML (Phase 6 rule).
AA6 (kit) Tests that count per address use their own address each, so limits never leak between specs (the flaky auth-codes test).

## Wave 3 list (halts that arrive after INT-2 started; applied in the NEXT reopen). Default (lead), owner may override.
BB1 (B12) ApprovedDate belongs to a business: it gains businessId, and the app's "approve this date" gets its routes:
    POST /v1/business/approved-dates {personId, kind: b|s, year} (idempotent) and DELETE the same. Until then it is read only.
BB2 (B12) Person stays the business's people, as the registry has it.
BB3 (B12) "Today" is the calendar date in Africa/Lagos (PROVISIONAL; an account's own zone can replace it later). 29 February is
    marked on 28 February in a year without one.
BB4 (B12) PATCH /v1/me `dates` goes through the dates service (the one-row rule); E-118 and E-120 take an empty phone as none.
BB5 (B12, Phase 6) The web app sends a UUIDv7 as the client id on E-46.
