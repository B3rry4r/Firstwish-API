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
BB6 (Verify B12, medium) A wish that is taken down, removed or erased leaves every saved list: whoever changes a wish to one of
    those states calls SavedWishesService.forget() in the same transaction. Owed by: the erase service (joined when b12 merges
    into the wave), B06 (the state machine's moves to resting-erased and taken down), B13 (staff take-down).
BB7 (Verify B12, low) The dates list pages in the database, not in memory; its cursor is the row's month-day and id, so a paging
    run that crosses midnight neither repeats nor skips. A POST naming someone else's id answers 404, not 409.
BB8 (P-B12) E-121 (import people) answers {added, skipped: [{row, reason}]}; the contract's `number` is replaced at the next reopen.
CC1 (B06) E-225 (save a draft) body gains `version` (required) and `timeZone`; `keep` is null | month | half | year (DEC-84). It
    answers 200 {version, updatedAt} (not 204 with a header), so the page always holds the version to send next.
CC2 (B06) E-231 (seal) body gains `version` and `timeZone`.
CC3 (B06) The size limit of a wish's content is a config value in the price book's lifecycle config (wishContentMaxBytes,
    262144, PROVISIONAL), not an env variable. A chapters limit applies only if the web app's catalog gives one per ticket (the
    seed export reads it; none found means no limit).
CC4 (B06) job has a unique index on (type, subject key); the advisory lock goes.
CC5 (B06) Owed by others: E-232 wake and E-228 keep by B07 (what a payment buys); the send-notice handler by B11; admin wishes
    E-218 to E-220 and admin jobs E-61, E-62 by B21, using the lifecycle and jobs services B06 exports. E-226 (add photos) is
    B06's own and is closed in its patch.
CC6 (B06) Restoring a resting wish makes it live again for the restore window. Listed to the owner.
DD1 (B05) Paying needs a signed-in account (any side); nothing about a payment is public. Listed to the owner: a receiver who
    wants to pay (to keep a wish) signs in with an email code first.
DD2 (B05) GET /v1/payments (the payer's own, newest first, cursor) is added to the registry.
DD3 (B05) Staff flags get their own columns: payment.flags (text list) and webhook_event.outcome; they move out of the options JSON.
DD4 (B05) A payment that is not the caller's is 404. `upgrade` is not a purpose yet (422) until B07 defines it.
DD5 (B05) VAT is as the documents say (T-40): 7.5% inside Pro and invoiced prices; the rate is a price-book value, never a constant.

## From Verify B06 (15 Nov) and the lead's own re-read of the documents. Default (lead), owner may override, unless it cites T-..
EE1 (high) Every job run has a time limit (60 s, per kind in config). A run that passes it is recorded as failed (timeout), retried
    with backoff, and the worker moves on; one stuck handler can never stop the others or the tick. Handlers get an abort signal.
EE2 (medium, kernel) Ill-formed text (a lone surrogate) is 422 by the same global check as control characters, never a 500.
EE3 (medium) A wish's content is checked against a closed shape at EVERY level, not only the top: a file can be named only under
    the known keys, and the receiver's read (B10) signs links only from the wish-to-file rows, never from ids found in content.
EE4 (low) Erasing a wish queues removal of its file objects that no other wish names (through the files job).
EE5 (low) Seal needs either an open time at least one minute ahead or an explicit openNow: true; a past or missing time is 422.
    An open time more than 5 years ahead is 422 (PROVISIONAL). Changing the zone recomputes the instant from the stored local time.
EE6 (low) A draft is removed by its owner, never "erased" (that move is refused).
EE7 (THE TERM, T-44; the lead's brief for B06 was wrong here) The term starts when the wish is FIRST OPENED by its receiver, not
    at its open time. At the open time a sealed wish becomes openable and nothing else changes. On the first successful receiver
    read at or after the open time (B10), in one transaction: openedAt is set once, the state becomes live, endsAt = openedAt +
    the ticket's term (7, 14, 30, 60 days), and the rest job is scheduled. B06 exports lifecycle.markOpened(tx, wishId, at) for it.
    Two first reads at the same moment set openedAt once.
EE8 (T-45) A wedding wish counts its term from the wedding date: endsAt = the wedding date + the term (a Save the date lives
    until the day, then for its term), whenever it was first opened.
EE9 A sealed wish that nobody opens stays openable; 365 days after its open time it rests (PROVISIONAL, listed to the owner).
Stale in the verdict (already fixed on the wave 2 branch after B06 branched): erase now kills the links, jobs, files and saves
(X10, J1, J2); uploads go to a staging key (Y1). The wave 3 base re-proves both once B06 is on it.

## From Verify B05 (15 Nov): how each finding is closed. Default (lead), owner may override.
FF1 (medium, kernel) Every call to a provider port has a time limit (10 s for payments; set per port in config). On a timeout the
    verify route answers the payment as it stands (pending) and never hangs; nothing is granted on a timeout.
FF2 (low) A signed event whose id or reference holds a control character is refused (400), never a 500.
FF3 (low) A stored event's id is type : provider id : reference, so two events for different references never collide.
FF4 (low) The same idempotency key after the payment succeeded answers 200 with the payment as it stands and no checkout address.
FF5 (low) A pending payment is abandoned at 60 minutes or older (not strictly older).
FF6 (low, kernel) In live mode PAYSTACK_SECRET_KEY must be at least 20 characters; boot refuses a shorter one.

## From B07's halts (15 Nov). Default (lead), owner may override. Applied in the next shared base (INT-4).
GG1 purchase_grant becomes a model in the schema (what was granted, from which payment, its end date, revoked or not).
GG2 The wish bundle exports fulfilTicketIn(tx, wishId, ticket) and the ticket handler uses it (one way to give a wish its ticket).
GG3 Starting a payment calls PurchasesService.assertStartable (the Keepsake extras ceiling, the wish is the payer's and can
    take the line). A wish that already has a ticket cannot be sold another: the app sells no paid upgrade (lib/catalog.ts has
    upgrades only inside the Pass: four Signature upgrades). So a ticket line for a ticketed wish is 422 at start. A Pass
    upgrade turns a Pass wish into a Signature by drawing one upgrade (no money). Listed to the owner: a paid upgrade has no
    price in the app or the documents, so it is not sold.
GG4 business.pack is wishes left from packs (as lib/pro-data.ts has it), never a count of packs. Vault space is the plan's GB
    plus the GB of live grants (a pack's 20 GB for 90 days, bought Vault space): the files bundle reads it from the grants.
GG5 Seal can draw from the Pass in place of a ticket payment: the seal body takes usePass: true and draws one wish in the seal
    transaction (20 at once with 1 left: one seals). Business client wishes draw from the business (B17).
GG6 Owed by others: Pro plan logins and invoices (an Invoice row with its VAT part for every plan and pack payment, T-40) by B17,
    called from the plan handlers; the end of a creator's Signed period by a timed job in B16.
GG7 (P-B06) E-225 (save a draft) body gains `passcode` (write only, hashed, never returned) and loses the legacy whole-wish fields
    (letter, blessing, ticket, photos and the like): the draft is saved through `content` and the named fields only.

## From Verify B07 (15 Nov): how each finding is closed. Default (lead), owner may override.
HH1 (high) A Pro plan's month is rolled by the server, not by a payment: whenever a business's plan is read or drawn from, the
    months that have passed since its stored month are rolled first, in the same locked transaction, by the rule in the web app's
    lib/pro-data.ts roll() (unused wishes carry forward as it says). A plan payment made early does not reset the running month:
    it pushes `renews` one month on from its current end. Tests work the verifier's case by hand (Starter paid 1 Dec with 4 used,
    paid again 20 Dec: January has a fresh allowance plus what rolled) and three more.
HH2 (medium, payments) Inside the settle transaction everything, the entitlement read included, uses the transaction's own
    connection, never the pool. 10 webhooks + 10 verifies at once on one payment: granted once, no 500.
HH3 (medium) Revoke does not restore a snapshot. It marks the grant revoked and works the state out again from the grants that
    remain (the plan is the newest unrevoked plan grant; counters are the unrevoked grants less what was used).
HH4 (medium) Revoking a keep works keep, keptBy, keptUntil and endsAt out again from the keeps that remain.
HH5 (low) A payment for an erased account is flagged refund_due and account_erased in payment.flags.
HH6 (low) A handler checks the business named on the payment is the payer's own (owner or a live login), else flags it for refund.
HH7 (low) A draw takes from the month's allowance only while the plan is live (renews in the future); pack wishes do not expire.
HH8 (low, payments) The start body's `ticket` field takes every ticket id.
HH9 The builder's "two keeps at once" test failed once in four runs (endsAt came out as now + 30 days): find the cause and fix
    it (a test that passes three times in four is a finding, never noise).

## From B11's halts (15 Nov). Default (lead), owner may override. Applied in the next shared base (INT-4).
II1 The email webhook (E-72: delivery receipts and inbound mail) is built with Support (B20), with its own signing secret in
    env (RESEND_WEBHOOK_SECRET). Until then "delivered" means the provider accepted it.
II2 E-75 and E-76 get a real MessageTemplate shape in the registry (key, name, subject, body, placeholders, version, editedAt,
    editedBy), not the Notice or Studio Template shape.
II3 message_delivery.idempotencyKey gets a unique index (the advisory lock goes).
II4 An account gets a timeZone (set at sign-up from the browser, changeable in /v1/me); notices use it; until it exists the
    wish's zone is used (PROVISIONAL).
II5 MessageDeliveryPurpose gains sealed and opens.
II6 Identity sends its sign-in code through notices.send and deliverNow (one path for every email); a failed send no longer
    undoes the code, and the person can ask again.
JJ1 (Verify P-B06, medium, kernel) The JSON body limit is 512 KB (a config value), above the 256 KB content limit, so an oversize
    wish gets the service's 422 with its reason, not a bare 413. (INT-4.)
JJ2 (for B10) lifecycle.markOpened answers {opened: false} when refused and never throws: the receiver's read must look at it.

## From Verify B11 (15 Nov): how each finding is closed. Default (lead), owner may override.
KK1 (high) A try at sending is claimed by ONE conditional UPDATE (the delivery is queued or due for retry AND its try count is
    the one read: then it becomes "sending" with the count plus one). Only the caller whose UPDATE took the row calls the
    provider. The job tick and deliverNow overlapping, or 50 calls at once: one provider call per try, at most 3 per delivery.
KK2 (medium) Staff wording: a subject is at most 150 characters and a body 4,000; no tags, no zero-width or control characters
    (422). Emails are plain text.
KK3 (low) Line breaks are stripped from any value that goes into a subject. KK4 (low) The staff log masks an address wherever
    it appears, inside values too. KK5 (low) An erased account's queued deliveries end "dropped", not failed. KK6 (low) Provider
    error text is scrubbed of codes as well as addresses.

## From B10's halts (15 Nov). Default (lead), owner may override. Applied in the next shared base (INT-4).
LL1 WishOpen (wishId, kind, first, session, createdAt), wish_reaction, wish_favourite and link_hit become models in the schema.
LL2 E-132 (react) answers {reaction, counts}, never the sender's Wish. E-134 (unlock) answers {ok: true, token, expiresAt} or
    {ok: false, error}; the token goes back in the x-unlock-token header. PublicWishView gains `files` (the signed links) and,
    while sealed, `opening` {id, scene}; nothing else of the content while sealed.
LL3 A question opening keeps its text at content.opening.values.question; the contract says so.
LL4 Old link_hit rows are removed by a timed job. PROVISIONAL limits: 60 reads a minute per address; 10 passcode tries an hour
    per link and address; 30 wrong tries lock a link for an hour.
LL5 Owed: the owner's wish detail (B06) shows opens, plays, reactions, favourites and shares through
    ReceiverActivityService.summary (joined in INT-4); "This is me, take it down" (E-133) is B13's.
MM1 (P-B11) The delivery status enum gains `sending` and `dropped` (INT-4), replacing the stand-ins "sent" (in flight) and
    undeliverable with a "Dropped" reason.
MM2 (Verify P-B11) A delivery left in flight past its stale time with all three tries used is marked failed for staff by the
    same sweep that picks up stale ones; a retry is taken only once its wait has passed. (Wave 3 join.)

## From Verify B10 (15 Nov): how each finding is closed. Default (lead), owner may override.
NN1 (high) A published wish can be played or shared from the feed only when its own wish is live and its open time has passed;
    a sealed or future wish is 404 there, whoever asks.
NN2 (medium, and wider than the finding) Reading a link never starts the term. Before the first opening a GET answers only the
    opening view, with openable true once the open time has passed. The receiver's opening gesture calls POST /v1/w/:slug/opens
    (E-131): that call, and only it, starts the term once and answers the full view (after the passcode step where there is
    one). After that a GET answers the full view. HEAD and OPTIONS never write anything. So a link-preview robot or a prefetch
    that GETs the link when the sender shares it cannot start the receiver's term.
NN3 (low) A slug with a control character or a bad escape is 404. NN4 (low) The keys kept for limits and the fallback session
    are HMACs with a server secret, never a bare hash of an address. NN5 (low) A reaction is 1 to 40 characters of ordinary
    text: direction-override and other invisible characters are refused.
NN6 (listed to the owner) 30 wrong passcode tries lock a link for an hour for everyone, the real receiver included.
MM3 (P-B07) HH5 is closed in the wave join (the settle's erased-account branch also sets refund_due). HH8 needs the contract:
    the start body's `ticket` takes every ticket id (INT-4 registry). Tests that run due jobs in a shared database pass the job
    keys they mean (`only`), so one spec never runs another's jobs (the cause of HH9; the join fixes the two specs that do not).
NN7 (P-B10) E-131 (POST /v1/w/:slug/opens) answers PublicWishView in the registry (INT-4). A reaction may hold the zero-width
    joiner that emoji sequences need; direction overrides and the other invisible characters stay refused (wave join).

## Wave 4 list (halts of B17, B08, B13; applied in this wave's joins or the next shared base). Default (lead), owner may override.
OO1 (B17) The "business" guard passes for the business's owner OR a live login of it. A person who only has a login acts on the
    business they are a login of; a person who owns one and is a login of another acts on their own unless the request names
    the other (header x-business-id, checked against their logins). Turning the business side on never makes a second business
    for someone who came in by an invite unless they ask for their own.
OO2 (B17) A "login-invite" message with its own wording is added to the notices catalog and seed.
OO3 (B17) E-33 (send a reveal from a shoot) is built with Vault (B18).
OO4 (B17) Invoice gains paymentId, period and voidedAt; the invoice counter becomes a model (next shared base); until then B17's
    SQL tables stand.
OO5 (B17) The plan, pack and Vault handlers call invoices.issue(tx, payment) in the settle transaction; a refund calls
    invoices.voidFor(tx, paymentId). (This wave's join.)
OO6 (B17) Reading a business (staff or owner) shows the month already rolled without writing; the roll is written only when a
    wish is drawn or a payment lands.
PP1 (B08) The refund and settlement calls stay their own port (RefundProviderPort); it moves to src/common/ports at the next
    shared base. The Paystack adapter is NOT RUN against real Paystack (R16).
PP2 (B08) E-84 gains `q` and `flag`, E-63 gains `day` in the registry (next shared base); the optional params stand until then.
PP3 (B08) Refund gains a `note` column (next shared base); the audit rows stand until then.
PP4 (B08) The edit to payments/webhook.service.ts (refund events go to a sink) is accepted.
PP5 (B08) Only whole refunds: amountKobo must equal the payment's amount. The seeded role table follows the registry: a role the
    registry names on a route holds the section that route checks (support can start a refund, E-145). (B08 patch.)
PP6 (B08) An email that fails for good marks the payment `refund_due` for a person to send; built with Support (B20), where the
    email provider's webhook lands. Nothing refunds by itself.
QQ1 (B13) E-133 takes an optional `code`; without one it answers {sent, expiresAt}. Registry at the next shared base.
QQ2 (B13) Lifting a ban gets a staff route (DELETE /v1/admin/bans/:id; owner and ops) at the next shared base.
QQ3 (B13) The owner's wish detail carries `publish` (WishesService.get calls publishStateOf). (This wave's join.)
QQ4 (B13) The lifecycle calls ShowingService.dropForWishes in the same transaction when a wish rests, is taken down, removed
    or erased. (This wave's join.)
QQ5 (B13) Accepted: one staff list with a `queue` field; flagged photos are decided through E-157; E-138 gives waiting then
    listed; a decision is in the audit row, not on the sender's timeline; the wish of the day can be set today through the
    next 6 days (PROVISIONAL, owner may change).
QQ6 (B13) The raw-SQL tables of B13 and B17 become Prisma models with erase rules at the next shared base.
