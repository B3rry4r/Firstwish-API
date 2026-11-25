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
RR1 (B17 verify, high) Staff answers about a business show each login's email masked, as every other staff answer does. (B17 patch.)
RR2 (B17 verify, medium) OO1 is built in the B17 patch: the guard takes the header x-business-id when the person is a login of
    more than one business or owns one and is a login of another; an invite to a person who owns a business is allowed and
    usable through that header; with no header the person's own business comes first, then the oldest login.
RR3 (B17 verify, medium) Erasing a business owner's account closes the business. Client wishes already sent keep playing to
    the end of their term (T-58) and are erased when the term ends (they do not rest a year); the owner's personal data and
    the business's records of the client (name, contact) go at once; the wish's own words and photos stay until then because
    the client was given them. (This wave's join: the erase rule and schema-map.) Default (lead), owner may override.
    Lows (downgrade with seats over the plan gives no notice; a login removed mid-request) -> build/sweeps/api.md.
SS1 (B13 verify, medium) A wish that is erased, or whose owner is erased, leaves no row in the public list tables: the published
    row and its request are deleted, not kept. A wish that rests or is taken down also loses its published row, so coming back
    needs a new review. dropForWishes does the deleting (B13 patch); the lifecycle and the erase call it (this wave's join, QQ4).
SS2 (B13 verify) Asking to publish needs the creator side, as the registry says (T-25; the phone part fell away with R11): a
    person-only account gets 403 naming the creator side. (B13 patch.)
SS3 (B13 verify) A banned account's old token and refresh answer 401 because its sessions are ended; a new sign-in answers 403
    account_banned. Accepted. A banned account reads nothing while banned. Default (lead), owner may override.
    Lows -> build/sweeps/api.md.
TT1 (B08 verify, high) One send asks the provider once. A send claims the refund in one statement (approved -> sending) before
    it asks; a send that loses the claim answers 409 and asks nothing. A time-out leaves it claimable again; before any second
    ask the adapter first looks the refund up at the provider by the payment's reference and creates one only if none is
    there (the stand-in models this; NOT RUN against Paystack). (B08 patch.)
TT2 (B08 verify, medium) PP5 in the seed: support holds the section E-145 checks. (B08 patch; scripts/seed.mjs, that row only.)
TT3 (B08 verify) E-86 keeps the two-person rule: it starts the refund and sends it in the same step only for the owner role;
    for anyone else it leaves the refund waiting for a second person (E-146). Default (lead), owner may override. (B08 patch.)
TT4 (B08 verify) refund_amount_mismatch is cleared when the refund succeeds. (B08 patch.)
TT5 (B08 verify) Refunding one pack takes away that pack's wishes only: left = max(0, left - the refunded pack's size); what
    was already used is written on the refund.kept row. (B08 patch; purchases/business-handlers.ts, the revoke only.)
TT6 (B08 verify) A provider error on the settlement check answers 502 in the envelope, never 500. (B08 patch.)
UU1 (B08 patch hand-back) A refund left claimed with no answer (status sent, no provider reference) for 10 minutes or more can
    be sent again by a staff member: the claim accepts it, the lookup at the provider runs first, and nothing is created if
    the first ask landed. No refund stays stuck. (B08 patch.) The pack revoke works from the business's total left (it cannot
    tell which pack a used wish came from): accepted.
VV1 (INT-4 verify, medium) E-231 (seal) answers PaymentStartedOrCovered as E-228 does: {payment: null, item} when no money
    moves. Registry reopen at the next shared base (INT-5); until then the seal answers the Wish and the difference is known.
VV2 (INT-4 verify, medium) An erase leaves no name in a link: the receiver's name at the front of wish_link.slug is cut off
    (the random tail stays so the old link still answers as an erased wish does, with no name), and the wish's wish_open
    rows are deleted. The schema-map rules say so. (This wave's join, J8.)
VV3 (INT-4 verify, low) hasPasscode joins the Wish contract and the legacy fields leave it (INT-5). Lows of the migration accepted.

## Wave 5 list (halts of B16, B15, B20, B19). Default (lead), owner may override.
WW1 (B16) The payments webhook passes transfer.* events to the payout sink, as it does refund events. (Wave 5 join.)
WW2 (B16) The ticket and extra handlers call royalties.accrue(tx, payment) in the settle transaction; a refund calls
    royalties.reverse(tx, paymentId) in the refund's transaction; one end-to-end test each. (Wave 5 join.)
WW3 (B16) The payout calls stay their own port (PayoutProviderPort); it moves to src/common with the refund port at the next
    shared base. The Paystack adapter is NOT RUN against Paystack (R16).
WW4 (B16) royalty_reversal and payout_detail become Prisma models with erase rules at the next shared base.
WW5 (B16) A "bank-changed" message joins the notices catalog and seed and the notice goes through the notices path. (B16 patch.)
WW6 (B16, B15) Style.creator is {creatorId, templateCreatorId?}; Studio writes it when a style is accepted.
WW7 (B16) Registry at the next shared base: RoyaltyAccrual loses rows and total; E-154 gains summary; E-41 gains bank.
    E-115's :id is the month (YYYY-MM): accepted.
WW8 (B16) The timed job that ends a creator's Signed period (GG6) is built in the B16 patch.
XX1 (B15) The eight submission checks on the server follow the web app's own checks (R5: /home/user/Firstwish-web/lib, the Studio
    checks function): same rules, same limits. A difference is a finding.
XX2 (B15) An AI request left waiting with no answer for 5 minutes gives its credits back and is marked failed (a sweep). No
    credit is lost to a crash. (B15 patch.)
XX3 (B15) Open's 3 credits are given once whichever code creates the creator's row first. (B15 patch.)
XX4 (B15) Accepted: a submitted Studio style holds a catalogue Style row (off, slug studio-<id>) from its first submit; the
    changes in StylesService, the erase and the seed. Next shared base: the snapshot table and a version column as models, a
    job kind for the checks, bodies for E-186 and E-192, SubmissionView.snapshot.
YY1 (B20) The email port carries replyTo and the Resend adapter sends it (next shared base, kernel). Until then a reply by email
    cannot reach its thread on the real provider: NOT RUN, and the Support bundle is not counted as working with real email.
YY2 (B20) Resend's received-email event carries no body: the email port gains a call that fetches a received email by id and
    the webhook uses it (next shared base; NOT RUN against Resend).
YY3 (B20) Next shared base: RESEND_WEBHOOK_SECRET in the env schema; a `resend` webhook provider in the guard; the contact-page
    route and the saved-reply routes (list, add, change, remove: a saved reply needs a writer) in the registry; ThreadDetail
    as a type; a `name` column for a contact-page thread; bounced and complained as delivery status values; the two raw-SQL
    tables as models; the index on MessageDelivery.providerMessageId in schema.prisma.
YY4 (B20) Setting refund_due goes through the refunds helper. (Wave 5 join.) The notices changes (support template, replyTo
    in vars, the suppression check) are accepted.
ZZ1 (B16 verify, medium) A transfer event counts only when its amount is a whole number equal to the payout's amount; a float,
    a string or no amount changes nothing and flags the payout for staff. (B16 patch.)
ZZ2 (B16 verify, medium) No payout stays stuck: every run first takes up payouts left pending from any earlier month; a payout
    left sent with no news for 24 hours is looked up at the provider (the port gains a lookup; NOT RUN against Paystack) and
    settled by what it says. (B16 patch.)
ZZ3 (B16 verify, medium) A creator whose account is banned is not paid while the ban stands; the balance waits. Default (lead),
    owner may override. (B16 patch.)
ZZ4 (B16 verify) A wish paid for with a ticket earns 20% of the premium style price in force, whoever pays (a person or a
    business) and whatever else was in the payment. (B16 patch.)
ZZ5 (B16 verify; T-66) A client wish drawn from a Pro plan month or a pack earns the creator of its Premium style 20% of that
    wish's share of what the business paid (the plan payment divided by the plan's wishes, the pack payment by the pack's
    size, rounded down), written when the wish is drawn, one per wish; a refund of that payment takes them back. NOT BUILT
    YET: it needs the accrual's unique to include the wish (next shared base), then a patch. Until then a Pro wish earns a
    creator nothing: this is owed, not accepted.
ZZ6 (B16 verify) A reverse that comes before the accrue leaves a mark so a later accrue of that payment earns nothing. (B16 patch.)
ZZ7 (B16 verify) Marking a payout paid by hand (E-114) is refused while a send is in flight (409). (B16 patch.)
SA1 (B15 verify, high) Staff deciding and a creator withdrawing take their locks in one order (the studio style, then the
    submission); the one that loses answers 409, never 500. (B15 patch.)
SA2 (B15 verify, high; XX1) The server's eight checks are the web app's checks function (Firstwish-web lib/studio.ts:620-680)
    rule for rule: holds takes bars, fills or breaks as the web writes them; chapters by kind and occasion with hidden layers
    and no kind chosen failing; readable on each scene ground and layer; only effects that are not calm count; a flat fallback
    manifest; the ending fails only when its action is hidden; pieces skip chapters, fallback and ending. Kept stricter on the
    server: a file that is unknown or not ready fails. (B15 patch; tests use style documents shaped as the web app makes them.)
SA3 (B15 verify, medium) What the AI returns is checked with the same shape check as a save; anything that breaks it is 502
    and the credits come back; `said` is plain text. (B15 patch.)
SA4 (B15 verify, medium) After a creator's erase an accepted style stays in the catalogue (T-62) with no person on it: the
    byline and Style.by are empty, the free-text brief is blanked, the snapshot keeps the design only. Default (lead), owner
    may override. (B15 patch.)
SA5 (B15 verify) A wish can pick only a style that is on; a held or returned Studio style cannot be picked (wishes already
    made keep theirs). A style in review refuses every change, `on` too. (B15 patch.)
RR4 (join 4 verify, medium) A client wish carries its business: the code that makes a client wish writes wish.businessId, in
    the same transaction, so RR3 works for real wishes and not only for rows set by hand. (Join patch.) Lows -> sweep.
ZZ8 (P-B16 hand-back) A failed payout may be marked paid by hand by finance or the owner with a reason (money that went out
    another way); it posts the payout journal again and writes one audit row. Accepted. Default (lead), owner may override.
CA1 (B19) The payments start prices a Concierge order from the order's own row (count, the Pass holder's 20% off, a quoted
    price), not as one unit: every order that can be placed can be paid. Until this lands only a single wish with no Pass can
    be paid: owed, not accepted. (Wave 5 join.)
CA2 (B19) Next shared base: E-34 takes wishIds; E-141's body; the customer's read, list and cancel and the staff cancel as
    registry routes; E-36 answers a page; E-148 answers PaymentStartedOrCovered; the storage port gains a server-side put;
    ConciergeOrder gains given and being-made states, paid and due times and links to its wishes and payment (the two raw-SQL
    tables become models).
CA3 (B19) The customer is told by email when the order is delivered (a "concierge-delivered" message through the notices
    path), and a business order's invoice is linked. (Wave 5 join.) Adding the qrcode library is accepted.
DA1 (B20 verify, medium) Mail from Firstwish's own addresses (the sending address, any reply+ address, the mail domain), and a
    bounce or delivery report however it is headed, never starts a thread or lands in one; staff cannot reply to a thread
    whose contact is one of our own addresses. (B20 patch.)
DA2 (B20 verify, medium) The complaint list uses the canonical address (letter case and +tag folded), as the contact limits do.
    (B20 patch.)
DA3 (B20 verify, low) A webhook secret with an empty key is refused like no secret; a reply token adds at most 30 messages a
    day to its thread (PROVISIONAL, counted in the database). (B20 patch.)
ZB1 (join 4 fix, lead) The fix for RR4 showed the real gap: making a client wish writes only a ClientWish record and no wish
    that plays; nothing gives a business's plan wish its Signature ticket. Ruling: making a client wish also makes a wish
    (a draft owned by the maker, carrying the business) and the draw gives it its Signature ticket in the same transaction;
    ClientWish links to it (wishId), and sent, opened and ends are read from that wish. Only a wish made this way carries the
    business: a business owner's own wishes do not. RR3 then holds for real client wishes. NOT BUILT: needs ClientWish.wishId
    (next shared base), then a Business patch. The RR4 attempt (branch rr4-attempt, 02cca9e) marked every wish of an account
    that has a business, which would keep a person's own wishes after their erase, so it is NOT merged. Until then: an erased
    owner's wishes are all erased at once (private by default), and a Pro plan wish cannot be sealed without a ticket: owed.
DA4 (P-B20 hand-back) "Ours" means the sending address, any reply+ address on the mail domain, and system boxes (mailer-daemon,
    postmaster, no-reply) on any domain; a person who shares the mail domain is still a person. Accepted in place of the
    whole domain in DA1.
CB1 (B19 verify, high) An order has one open payment at a time: the start locks the order and, while a payment for it is
    pending, answers that same payment and asks the provider nothing more; 20 starts at once make one payment and one
    provider call. (B19 patch.)
CB2 (B19 verify, medium) A delivery counts only wishes that are sealed or live; a draft is refused. (B19 patch.)
CB3 (B19 verify, low) The order's maker may make its QR card as the registry says; count must be a whole number (a string is
    422); a quote is capped at 100 times the list price of the order (PROVISIONAL). (B19 patch.) CA1 and CA3 move into the
    B19 patch: the payments start prices an order from its own row; the customer is emailed on delivery.
SA6 (P-B15 re-check, round 2: lead rules) Merge. The two left-overs are small and go into the wave 5 join (J8): the AI answer's
    `art` is checked like the rest; saving a draft wish with its own style again is never refused. The file-not-ready check
    stays stricter on the server.
CB4 (P-B19 hand-back) E-141 reading the token itself is accepted only until the next shared base, where the guard lets one
    route take a user or a staff member. A maker's card for an order's wishes needs no per-wish card check (the card is part
    of the order). The changes in payments.service and fulfilment.registry (the start check may set the price and answer a
    pending payment) are accepted subject to the re-check.
CB5 (P-B19 hand-back) A staff quote cannot be changed while a payment for that order is pending (409). (Wave 5 join.)
EA1 (B18) Its four raw-SQL tables (reveal_access, reveal_play, reveal_send, vault_peak) get baseline lines when the branch
    merges (lead) and become models with erase rules at the next shared base.
EA2 (B18) Registry at the next shared base: switching a reveal link off; the client's link (GET /v1/r/:code and its unlock);
    RevealPlay's answer shape.
EA3 (B18) The Vault's limit counts the plan's space only while the plan is live, so a lapsed plan is refused at the upload
    ticket too (stored-files; wave 6 join). The peak is lifted on the file-confirm path as well (wave 6 join).
EA4 (B18) After an owner's erase the client wish's reveal (name, note, credits) is blanked at the end of its term with the
    rest (wave 6 join). The shared wrong-try lock, the exported passcode hash and the "reveal" message are accepted.
ZB2 (lead; replaces ZB1 pending the facts) B18 shows that a client wish plays at its own link (the reveal player), not as an
    ordinary wish with a ticket. ZB1 is on hold: the web app's own flow is being read (R5) before anything is built. The
    dead branch for wishes with a business (wave 4 join, J5) is reviewed with it.
ZB3 (lead, from the web app's own flow, R5; replaces ZB1 and ZB2) A business's client wish is made five ways in the app and
    each counts once against the plan. With a reveal (the reveal form; a reveal sent from a Vault shoot) it plays at the
    client's link through the reveal player (B18). With no reveal (the "New client wish" sheet; approving a person's date; a
    wish made in the maker by a business, which the app seals "on the plan" as a Signature with no ticket sold, Maker.tsx
    sealOnPlan) it is an ordinary wish: the client-wish record links to a wish (wishId) that carries the business, takes its
    Signature ticket from the same draw in the same transaction, shares its number, is written in the maker and opens at the
    ordinary receiver's link. For the maker's path the seal takes `usePlan` (as it takes usePass): it draws, writes the
    client-wish record and gives the ticket. Only wishes made these ways carry the business; a business owner's personal
    wishes do not. RR3 (keep playing to the end of the term after the owner's erase) covers both kinds.
    Known gaps in the app itself, owed to Phase 6: a client wish made from the sheet or a date has no words of its own today
    (the client would see sample wording): the sheet and the approval must open the maker on the new wish; `madeOwn` has no
    writer anywhere: it is set when a person who opened a client wish seals their first own wish (a mark carried from the
    link), or the number is cut from the dashboard. NOT BUILT: next shared base (ClientWish.wishId, seal `usePlan`), then a
    Business patch.
EB1 (B18 verify, medium) Sending a reveal is limited: 5 emails a day to one address from one business and 100 a day for a
    business (PROVISIONAL), counted in the database, fail closed. (Wave 6 join.)
EB2 (B18 verify, medium) A signed file address already handed out lives up to 10 minutes after a link is switched off: accepted
    (the next read is refused; a signed address cannot be recalled). Lows -> sweep.
FA1 (join 5 verify) An invoice's VAT part and the ledger always agree. Concierge carries VAT (T-12 says one VAT invoice): its
    payments book vat_payable like Pro's. Creator plans, credit packs and reviews: no document says they carry VAT, so their
    invoices state the total with no VAT part until the owner says (OWNER QUESTION, a tax matter). (Wave 6 join.)
FB1 (B21) The contact reveal answers {phone, email} once (A19, DEC-130 outrank the 204 of Q12): registry at the closing base
    (INT-6); the service already returns both.
FB2 (B21) Numbers.lines is a list of {line, name, definition, amount} in the registry (INT-6).
FB3 (B21) Storage is chosen at deploy (R2: two adapters, one env value). The staff setting shows which one runs and cannot be
    changed from the screen: a change is 422 saying so. No control that does nothing. (B21 patch.)
FB4 (B21) "Connected" is read from evidence of a real call until the ports gain a ping (INT-6). Sending a wish's link again
    uses the "opens" message. Extend adds 7 days (the admin app's number). Masks as built. Accepted.
FC1 (B21 verify, high) An action reached through the staff wish and person screens needs the same role as the route that owns
    it: ban: moderator, owner; lift a ban: owner, ops (QQ2); erase an account: owner only; take down and restore: moderator,
    ops, owner; start a refund: finance, ops, owner (sent in the same step only by the owner, TT3); extend and send the link
    again: support, ops, owner. Any other role gets 403 and nothing changes. Default (lead), owner may override. (B21 patch.)
FC2 (B21 verify, low) Staff may add at most 30 days in all to one wish, and send its link again at most 3 times a day
    (PROVISIONAL), counted in the database. (B21 patch.)
FC3 (P-B21 hand-back) Finance starts refunds from the payments screen, which its role opens; the wish screen is not open to
    finance, so the refund action there is for ops and the owner. Accepted.
ZB4 (P-B17b hand-back) A client wish belongs to the business, not to the login who made it: when a login's own account is
    erased, the business's client wishes that login made (drafts and sealed) pass to the business owner's account and keep
    playing; the login's personal data goes. (Wave 6 join.) ClientWish.wishId joins the contract at the closing base. A
    client wish takes its wish's number at the seal (no gaps): accepted. A refund of the plan payment does not unseal wishes
    already made: accepted (the existing revoke).
GA1 (lead, my miss) The route check found 13 registry endpoints with no route and no bundle: keep and wake (owed since CC5 and
    never tracked), the Pass read, approved dates' writes, the staff ledger rows (bundle B22), the sender's AI writing and the
    maker's four reference reads (bundle B23). The check now runs in CI with a lead-owned baseline that only shrinks, so an
    endpoint cannot be left out again. The 30 INTERNAL endpoints (in-app ports) get the same check before Phase 5 closes.
ZB5 (P-B17b verify, medium) A wish that carries a business is reached only through the business. When a login is removed, or
    their own account is erased (ZB4), the business's wishes they made pass to the business owner's account in the same
    transaction; the removed login gets 404 on them and can neither read nor seal them. (Wave 6 join.)
GA2 (lead) The 30 INTERNAL endpoints: 29 have code and tests (the daily settlement job, sending a message, the 24 fulfilment
    handlers, screening, signed reads, the wish number). E-89 (concierge.rush) has none because rush is not sold (Z2): the
    closing base removes E-89 and its declared price-book line from the registry.
GB1 (P-B16b hand-back) Every client wish earns at its seal whichever way it was made: the ordinary seal of a wish that carries a
    business calls the same accrual, reading what it was counted against (month or pack) from its client-wish record.
    (Wave 6 join.) A banned creator still earns and the payout waits (ZZ3): accepted. The draw accrues at the seal because
    the style can change until then: accepted.
GC1 (B23) E-12 and E-14 take `transcript` (the text the browser's own dictation or the keyboard gave); voiceFileId is optional
    and never read (R13: no audio reaches the AI). Any signed-in person may ask (a sender is a person). The AiRequest answer
    carries only the fields that apply to its kind. Registry at the closing base. The daily cap of 20 is PROVISIONAL.
GC2 (B23) A voice file named in an AI request can still be deleted or erased: the link is cleared, not refused (closing base).
HA1 (B22; T-48 and the pricing page "You can keep it, or they can") The receiver can keep and wake a wish too. A signed-in
    person who holds the wish's link (and has passed its passcode where one is set) may buy a keep for it and wake it: the
    payment is theirs, the keep moves the wish's end as the owner's does, a refund takes it back, and they see nothing of
    the owner's account. (B22 patch.) Sold on the pricing page, so it is built before Phase 5 closes.
HA2 (B22; T-14 "keeps every wish its holder made live while the Pass is active") For the Pass holder's own wishes a keep or a
    wake is covered: no payment (payment: null), the wish is live until the Pass ends, and it rests again when the Pass ends
    unless a paid keep covers it. Anyone else pays. (B22 patch: build on what the Pass code already does, or say it does
    nothing yet.)
HA3 (B22) E-232 follows the registry: the owner, or a signed-in receiver who holds the link; a stranger is refused. Approving
    a date needs the person's matching date: accepted. E-83 and E-64 gain their extra fields in the registry (closing base).
GD1 (B23 verify, medium) An AI answer holding a control character is refused (502) like any rubbish; whatever goes wrong after
    the provider answers, the row is marked failed and its place for the day comes back: never a 500, never a stuck row.
GD2 (B23 verify, medium) Erasing one wish blanks the words of its AI requests (transcript, output), as an account erase does.
GD3 (B23 verify, medium) The seed export keeps rows that differ only in nested fields: every chapter spec of the web app is
    served (99, not 97); a test counts each of the four lists against the web app's own files.
GD4 (B23 verify, medium) Ending purposes are read by any signed-in person (the maker every sender uses reads them); the
    registry is corrected at the closing base. (All four: B23 patch.) Lows -> sweep.
HB1 (B22 verify, high) A wish's end is always worked out from scratch by one function, never by adding to or taking from the
    stored end: start from the wish's own term end (first open + the ticket's term, the wedding rule EE8); for each paid keep
    that still stands, in the order bought: begin at the later of the running end and the moment it was bought, then add its
    days; the end is the later of that and the end of any live Pass of the owner. Every event calls it (a keep paid or
    refunded, a Pass bought, ended or refunded, a wake). keptBy says what holds the end (keep, pass or none). Never an end
    later than what is paid for or covered; never earlier. Default (lead), owner may override: a keep bought while a Pass
    covers the wish counts its days from the day it was bought.
HB2 (B22 verify, low) The Pass read shows the end of the last live Pass when two are stacked; a refund schedules no rest job
    for a wish that already rests. (Both with HB1: B22 patch.)
HB3 (P-B22 hand-back; T-14) A wish never rests while its owner's Pass is live: the first open and the rest job both work the
    end out with the same function (HB1) before they act, so a Pass bought before the wish was opened counts from the start.
    (Wave 6 join.) Accepted: on a tie a paid keep holds the end; a Pass bought later does not wake a wish that already rests
    (its holder wakes it free).
HB4 (P-B22 re-check, medium, older than the patch) Cancelling a job never throws: a job with run history is marked cancelled,
    not deleted, so a keep payment's settle cannot fail on it. An ended Pass does not count as live. (Wave 6 join, J10.)
HC1 (join 6 hand-back) After an owner's erase, the Vault files a reveal still shows are kept until that reveal's term ends,
    then removed with it (as a kept wish's own files are): a reveal that plays must have its photos. (Join 6 patch.)
HC2 (join 6 hand-back) Closing base: a `cancelled` job status (the join marks a cancelled job with history as succeeded for
    now); the schema-map erase rule for ClientWish.reveal says what the code does (blanked at the end of the term).
HD1 (join 6 verify, medium) A login's own erase blanks their contact in the business's login rows too. (Join 6 patch.)
HD2 (join 6 verify, medium) A client wish earns from the payment it was DRAWN against, not from what the business holds when
    it is sealed: the draw records its source (month or pack, and which payment) on the client-wish record at the draw; the
    seal reads it. Needs a column (closing base), built there with the verifier's case (April Starter 4 used, May Studio, 8
    sheet wishes: six at 70,000, two at 60,000). Until then a sheet or date wish sealed in a later month can earn the wrong
    share: owed, not accepted.
HD3 (join 6 verify) The login check for making a business wish runs under the business owner's lock, so a wish made while its
    login is being removed belongs to the owner; POST /v1/business/client-wishes never answers 500 under load (find the
    cause). (Join 6 patch.)
HD4 (join 6 verify) Extra Vault space shows no VAT line and books none, like the creator lines: OWNER QUESTION with them
    (which lines carry VAT beyond Pro plans, wish packs and Concierge). Until answered the invoice states the total only.
HE1 (INT-6 hand-back) The seed never overwrites what a staff member has set: a setting, a price or a wording that exists is
    left as it is (create if absent). A test that needs the seed's figure sets it itself. (Sweep bundle.) The tests that
    still fail now and then because specs share one database (int1-rulings U1; join4 J1's invoice number) are fixed there
    too: each asserts on its own rows.
HF1 (INT-7 verify, high) A removed draft gives its wish back only to a source that still stands: nothing returns to a pack or a
    plan month whose payment was refunded (its grant revoked) or that has ended. (INT-7 patch.)
HF2 (INT-7 verify, medium) Working out which pack a wish is drawn from ignores records already given back. (INT-7 patch.)
HF3 (INT-7 verify, low) The "more logins than the plan allows" notice is sent once while that stays true, not once per payment;
    the stand-in refund lookup matches the amount as the real adapter does; a Numbers target set by a principal with no staff
    row is refused with a 4xx. (INT-7 patch.) A draft drawn last month and removed this month gives nothing back: accepted.
HG1 (give race) Two staff giving one Concierge order: the code is right (overlapping gives end one 200 and one 409; a give
    after another has landed is a "give again", which A9 allows). The gap: a staff member acting on a stale screen silently
    replaces the maker. A give carries what the staff member saw (the order's maker, or none); if the order no longer
    matches it answers 409 order_changed and changes nothing. A body field, so a registry change: with the next API base,
    and the staff Concierge screen (W14) sends it. Default (lead), owner may override.

## HH (16 Nov 2026, the lead, on API-BASE-2's hand-back). Default (lead), owner may override.
- HH1: the give's `expectedMaker` is required (HG1, DEC-212). Every older test that sends a give sends the maker it saw; a
  test is edited only to add that field, never its expectations.
- HH2: a test that sets `business.pack` by hand with no pack grant builds the pack by a real (stand-in) payment instead; what
  it expects stays as it was. A pack with no grant gives nothing back (API-BASE-2 case 2).
- HH3: the web files the seed is drawn from changed with W0c (8d97b86: lib/account.ts, lib/engine/types.ts, lib/studio.ts).
  The seed is re-drawn from the web head; if what the API serves changes (a word, a label), the seed changes with it and the
  record of hashes (prisma/seed-data/SOURCE.json) is refreshed; a hash is never refreshed without the comparison.
- HJ1 (16 Nov, the lead, on API-BASE-2's verifier; revises TT5). Refunding one pack takes away THAT pack's own unused
  places and no other pack's: off the counter comes (the pack's size - the standing draws sourced to it by drawPaymentId),
  never below 0. The refund records the pack's own standing draws as its `drawn`. TT5 worked from the business's total
  because draws could not be traced to a pack then; since ZZ5/HF2/API-BASE-2 they can. Seen: pack A full (5 drawn), pack B
  with 2 drawn; refunding A left the counter at 0, so B's 3 paid places were lost, and A's drawn read 2. Draws made before
  drawPaymentId existed (none: nothing is live) fall back to TT5. Default (lead), owner may override.
- HK1 (16 Nov, the lead, on W0b's HALT). The test stack cannot read a sign-in code: the stand-in email keeps its messages
  in the API's memory and the code is scrubbed from the delivery row. The web driver planted a code in the database by
  working out the API's own HMAC: a workaround, not a seam. The stand-in email adapter (never the real one) appends every
  message it "sends" as one JSON line (to, template, subject, the text, the time) to the file named by
  STANDIN_MAIL_OUTBOX when that is set, and the app REFUSES TO START if that variable is set while the email provider is
  the real one or NODE_ENV is production. No HTTP route. The web's live stack sets it and the drivers read the code from
  the file; scripts/live/standin.mjs's planted code goes. Default (lead), owner may override.
- HK2 (16 Nov, the lead, on W0b's hand-back). After a reload a person who chose light sees dark until the server answers,
  because nothing is kept in the browser (R10). The session screen holds its neutral loading state until /v1/me answers
  and only then paints, so no wrong mode flashes on a signed-in screen; the public website keeps the device's own
  preference (prefers-color-scheme) with no store (W1). Measured by the W0b verifier; a fix is a W3 case if it flashes.
- HK2 (revised 16 Nov after W0b's verifier measured it): a person who chose light and reloads a signed-in screen sees dark
  for about 0.4 s until the server answers. Painting the device's preference first would be worse (most accounts are dark,
  many devices light). The only cure is a small server-set cookie holding "light" or "dark", which touches the owner's rule
  R10, so it is the OWNER'S call (asked 16 Nov); until then the flash stays, recorded in build/sweeps/web.md.
- HL1 (16 Nov, W0b verify, medium): lib/maker.ts saveWish wrote the whole account (name, email) to localStorage after a
  real sign-in. Identity is never in a browser store from W0b on: that write goes now (P-W0b); the maker's own draft
  store (fw-maker, voice notes) goes with W4 and W5, the website's mode store with W1, as the baseline says.

## HM (16 Nov 2026, the lead, on W4's hand-back). Default (lead), owner may override.
- HM1: GET /v1/wishes/:id (and the list where the contract says so) returns makerNote as the contract has it; the maker's
  call screen is drawn only once it can be read back (W4 leaves it undrawn until then).
- HM2: kinds and occasions are values of the contract (what the server's styles and the wish's enum give); the words shown
  for a value are copy in the web app (lib/catalog), not data. No reference read is added for them.
- HM3: starting a wish is safe to repeat: POST /v1/wishes takes an Idempotency-Key (the same key answers the same draft),
  and a person who already has an UNTOUCHED draft (made, never given any answer) gets that draft back instead of a new
  one, so empty drafts do not pile up. A kind or style sent with the start counts as an answer.
- HM4: Wish.content is an object in the contract (the generator typed a parent with named children as text); a registry
  correction, no change on the wire.
- HM5: a removed wish stays readable to its owner with status removed while it can be restored; the page's own line for
  that state is copy for a state, not a made-up error.
- HM6: a refresh with no cookie answers 401 with its own error code (no_session), so the web shows the server's words for
  an ended session and nothing to a first-time visitor (W0b F3).

## HN (16 Nov 2026, the lead, on W11's hand-back). Default (lead), owner may override.
- HN1: what each staff role may open is the server's to say: the staff "me" read (and the Team read) carries the role's
  sections (the contract's RoleAccess). Until it does, the admin shell's own copy of the role table decides only what is
  DRAWN; the server still refuses (403) and the designed refusal shows. The copy goes when the API serves it (next API base).
- HN2: one API client. lib/api.ts gains a session option so the staff session uses it; a second client inside
  lib/staff-session.ts is a fork and goes in one shared-change task after W3, W4 and W11 are merged (the lead serialises
  changes to shared modules).
- HN3: the old seam code and fixtures of wired screens are removed by the bundle that wires the LAST screen using a file;
  a file shared with a later bundle (lib/admin/d-api.ts, the admin fixtures) is cleaned by that later bundle (W12-W14).

## HO (16 Nov 2026, the lead, on the verdicts for API-BASE-3, W3 and W11). Default (lead), owner may override.
- HO1 (revises HM3; API-BASE-3 verify, high): a start NEVER changes a draft that exists. The only draft handed back is one
  made by a bare start (no kind, occasion or style sent) that has never been written since (no PATCH, no upload, nothing:
  its version is the one it was made with), and it is handed back only to another bare start, unchanged. A start that
  carries a kind, occasion or style always makes a new draft (unless its key repeats). The derived "untouched" test goes.
- HO2: a remembered Idempotency-Key answers its wish only while that wish is still a live draft; once the wish is removed,
  sealed or erased the key is spent and the start answers 409 (key_spent) with words; it never hands back a removed or
  sealed wish as if just started.
- HO3: the makerNote size limit holds for every note, not only one with a wedding.
- HO4 (W3 verify, high): Home keeps every control the server can serve: react, save, share, the creator and follow, open
  and play, and the list from /v1/showing; a part with no server behind it (stories, a "Following" list if the API has no
  such read) is not drawn and is listed as an API request, never silently dropped.
- HO5: removing a draft asks first, then leaves the removed wish's page for Wishes; a payment that failed or was left
  shows the server's reason where it gives one; Wake sends one request however many taps.
- HO6: the app's types for what the server sends come from the contract file; where the contract is wrong (the link
  read, Wish fields) that is an API fix, and until it lands the web keeps ONE named cast per shape in lib/person.ts with
  the API request beside it, not a parallel type.
- HO7 (W11 verify, mediums): the staff sign-in says "If this email is on the team, a code is on its way." (it must not
  say Sent for an address that is not staff or is over the limit); the Audit filters offer every section the contract has
  and every staff member the Team read gives the role, not only what the loaded rows hold. With the one-client change (HN2).

## HP (16 Nov 2026, the lead: what the wiring found the API still owes; API-BASE-4). Default (lead), owner may override.
- HP1: the staff "me" read and the Team read carry what the role may open (the contract's RoleAccess), so the admin
  shell stops keeping its own copy of the role table (HN1).
- HP2: a wish's PATCH refuses an occasion the kind does not have and a step out of range (422 on the field).
- HP3: the owner's own wish read gives a signed, short-lived read url for the cover and each photo beside its id, so
  the owner's cards and detail can show pictures; the public link's rules for a receiver are unchanged.
- HP4: the contract says what the server sends: the link read answers {link, slug}; Wish.no is nullable; the wish's
  state values are the server's (one name, state or status, whichever the server sends).
- HP5: the wish read carries the video's state (none, asked, rendering, ready, failed), so the app asks for the video
  only when there is one.
- HP6: test stacks can move time: a clock offset the stand-in clock reads (STANDIN_CLOCK_OFFSET, seconds), refused at
  boot in production or with live providers, so a verifier can reach "resting", "ended" and "window over" the real way.
- HP7: two staff changing one team member: the change carries the version it saw; the second gets 409 with words.
- HP8: the staff Team read leaves out removed staff unless asked for them.
- HP9: a feed row carries the viewer's own reaction and saved mark, so they survive a reload (W3 patch, request 7).
- HP10: the contract matches the server where the web had to cast (the follow body, the react answer, the published
  wish's creator, the play read, loose price-book, style and date fields). The registry is corrected, not the wire.
- HP11: there is no "payment left" call: a payment the person leaves stays pending until the provider's session ends,
  and starting again for the same thing reuses it (seen: the same reference came back). Stories and a Following list
  have no server read and are not drawn; they are product additions for the owner to ask for, not gaps.
- HP12 (W13's hand-back): staff people search takes a wish number; a moderator can see the held photo they are judging
  (a signed short-lived read, audited); the wish-of-the-day picks for today and the next 6 days can be read back; the
  creators list says which payout months are due. Now Showing has no order control: the list is newest first (no
  reorder in the contract; an addition for the owner to ask for).
- HP13 (W3 round 2): a published wish reaches the feed with its creator's handle (when there is a creator side) and its
  cover picture; today the server's publish writes neither, so a real row has no "@" and no picture. API-BASE-4 item 11.
  The web never draws "@" or a creator button for a row with no handle (P-W3b).

## HQ (16 Nov 2026, the lead, on W5's hand-back). Default (lead), owner may override.
- HQ1: nothing a person types in a designed field of the maker is thrown away. The fields the contract's content shape
  lacks (the cover's school, years and born; the letter's line; the reasons' note; the memory's quote; the blessing's
  note; the download link) are added to the contract and saved (API-BASE-5); until then a field that cannot be saved
  is not drawn. Dropping it on the wire while still drawing it is a defect.
- HQ2: no sample photo, name or text ever stands in for the person's own in the maker, the preview or /w/mine: where
  the server gives no picture yet, the tile shows the mark and says the photo is saved.
- HQ3: test stacks can take an upload: the stand-in storage receives the signed put (as it already serves the signed
  read), refused in production and with live providers (API-BASE-5). The stand-in AI answers in the contract's shape.
- HQ4: a person can ask friends for voices by a link of their own (the gather link): the API serves it to the wish's
  owner, not only to a business (API-BASE-5; the screen is drawn when it does).
- HQ5: which styles a ticket may use is the server's rule (the style's level against the ticket's): the API enforces
  it on the draft and at the seal and says so in words; lib/levels.ts as a local rule goes (API-BASE-5, then W6).

## HR (16 Nov 2026, the lead, on W8's verdict). Default (lead), owner may override.
- HR1: a business is never surprised by a plan payment. Before paying, the Plan screen says what paying does, in the
  server's terms: the same plan while it is live adds a month (to which day); another plan replaces the live one from
  now (and what happens to the time already paid: the server says). The API tells it (the plan read gives, for each
  plan on offer, what a payment now would do) and REFUSES a second plan start while one of the business's plan
  payments is still pending (409 with words), so two tabs cannot both pay. Packs may be bought more than once.
- HR2: after any payment the person lands where they paid from, with the result read from the server and said in
  words: a plan or a pack returns to the business Plan screen, never silently to Wishes.
- HR3: a login of a business is known as one: the person's own read (/me) carries the businesses they are a login
  of; the app opens the business screens for a login (what the server lets a login do) and never offers "Add a
  business" on a business's pages to someone who is a login of it. A removed login sees the server's words.
- HR4: a removed draft client wish comes back to the pack when its restore window ends (HF1), and the screen says
  so ("back in your pack on <day> unless you restore it"); it is not shown as given back at once.
- HR5: an import says, row by row, what the server refused and why; the client drops nothing silently; the server
  refuses a phone that is not one and says so, and the same person twice is asked about, not doubled (API).

## HS (16 Nov 2026, the lead: the sixth API round). Default (lead), owner may override.
- HS1 (HQ4, the flow): a friend adds a voice through the wish's gather link with no account: the link shows who is
  asking and for whom (first names only), takes one voice note (an upload through the same signed put, the same
  limits, screened like any file) and the friend's first name, and nothing else of the wish is shown. The owner sees
  each voice arrive and may remove one. The link works while the wish is a draft or sealed and not yet open; it can
  be turned off by the owner. Counted against the wish's voice limit (12).
- HS2 (keep and wake by link, HA1/HA2): the holder of a wish's link (and of its unlock where it has a passcode) may
  pay to keep or wake it with no account; the public view gives what the payment start needs; a resting wish's link
  says it is resting and offers the wake; the payment's result is read back by the link holder with the same proof.
- HS3 (house wishes): each style that is on has one house wish that plays it, made by the house creator from the
  style's own package and sample content that is marked as the house's (never shown as a person's), published, and
  linked from the styles read. A style with no house wish has no link.

## HT (16 Nov 2026, the lead, on W5's second check). Default (lead), owner may override.
- HT1: W5's second check was its last round. What it found is new work that only real uploads could show, so it is
  re-cut as its own small task (W5b: the maker's photos under real uploads and the preview with photos), with its own
  builder and verifier, on the same branch. W5 merges with W5b.
- HT2: two tabs or two devices adding photos to one draft never lose a photo without a word: the add retries on the
  server's 409 with the newest draft, and if a photo still cannot be kept the tile says so with the server's words.
- HT3: the preview (/w/mine) plays what the maker's "See it so far" plays for the same draft, for every kind, with
  or without a letter; it never crashes on a draft the server holds.
- HT4: a style's tile in the picker is the style's own demo and may play the house's sample (it is a picture of the
  style, not the person's wish). It carries no words that claim it is theirs. Allowed as it is.

## HU (16 Nov 2026, the lead, on API-BASE-6's verdict). Default (lead), owner may override.
- HU1: a link holder who pays to keep or wake a wish gets NO account. The payment belongs to the wish; the payer's
  email is kept on the payment only (for the receipt and a refund), never as an Account row, never joined to an
  account that has that email, and the answer is the same whether or not the email has an account (nobody learns
  which emails are customers). Staff People lists accounts only.
- HU2: a house wish is the house's: it cannot be kept, woken, reported or paid for, carries no keep offer, and is
  left out of staff Numbers, payouts, royalties and the customer counts.
- HU3: a link holder's unfinished payment never blocks the wish's owner (or another holder) from paying: each payer
  has their own payment; the first to settle keeps or wakes the wish; a later one that settles for the same wish and
  term is marked refund due by the existing rule and the payer is told.
- HU4: only a voice that has really arrived counts against a wish's 12; an ask that never uploads holds no place;
  asks are limited per address and per link; the owner can always add their own voice and clear what friends sent.
- HU5: a removed login gets the same refusal (login_removed, with words) on every business read; /me does not list
  a business the person was removed from.
- HU6: a payment the sweep closed as abandoned that the provider later reports paid is fulfilled only if nothing else
  has since paid for the same thing; otherwise it is marked refund due. A plan is never applied twice for one intent.

## HV (16 Nov 2026, the lead, on W1's verdict). The website's words are the owner's.
- HV1: no bundle deletes or rewrites a sentence of the owner's website on its own judgment. Where the product
  documents or the API back a sentence, it stays (and a comment names what delivers it: the unbacked-promises gate's
  MECHANISM marker). Where nothing backs it, it is listed for the owner (build/owner/website-copy-audit-16nov.md) and
  stays as the owner wrote it until the owner answers, except: made-up customer quotes, "coming soon" cards and a
  hand-typed price that the price book contradicts come off the page now (the owner's own rules: no faked content,
  no "coming soon", prices from the server).
- HV2: a figure worked out from a price uses the price in force (the offer), as the API pays: a creator's share shown
  on the website is 20% of what the buyer pays today, with the list figure beside it only if the page says which is which.
- HV3: a public page keeps its last good copy when the API cannot be reached at refresh; it never swaps prices for
  "could not be loaded" while a good copy exists.
- For the next API round: the price book serves the Concierge delivery hours (the code uses 3; the field says 0), the
  erase-now period and the photo limit, so the website's sentences read them; and reactions: the product says Keepsake
  and above, the API lets any ticket react: OWNER to say which.

## HW (16 Nov 2026, the lead: the seventh API round). Default (lead), owner may override.
- HW1 (R11): every settled payment sends one receipt by email: to the account's email, or to the payer's email kept on
  the payment when a link holder paid (HU1). It says what was paid for, the amount, the VAT part where the invoice
  has one, and the reference. One per payment (a replayed webhook sends none); a refund sends its own notice. The
  templates are listed where staff Messages lists the others.
- HW2 (Studio files): a creator's style may hold pictures, a poster, sound and a 3D model, and a creator a profile
  picture, each through the same signed put, confirm and screening as any file, with a draft's style id accepted.
  Limits until the owner says: a picture and a poster as a wish photo; sound 10 MB; a model 15 MB (PROVISIONAL, in
  the price book's limits, changeable in staff Prices). The style's owner reads its files by signed read; so does
  anyone playing a wish in that style once the style is approved. Nothing else of a draft is readable by others.
- HW3 (Signed and the Creator plan): a creator can turn Signed off and move from Creator to Open. Neither refunds:
  what is paid runs to its paid day and is not renewed; the read says until which day. Turning it back on before
  that day costs nothing more for that period.
- HW4 (R14): the payout threshold and the payout day are price-book values served by the price-book read with their
  provisional mark; no screen types them.
- HW5: a confirmed upload attached to nothing (no wish, brand, shoot, style or profile) is removed after 7 days.
- HW6: the price book is the one source for the Concierge delivery hours (3), the erase-now period and the photo
  limits; the code reads the book (a field that says 0 while the code uses 3 is a defect).
- HW7: the staff session read says, per section, which actions this role may do; staff reads are typed in the
  contract (no loose object where a screen draws fields).

## HX (16 Nov 2026, the lead, on the seventh API round's check). Default (lead), owner may override.
- HX1 (HW2, HW6): every value the price book serves can be changed in staff Prices by the roles that change prices
  (audited, versioned like a price): the file limits, the Concierge delivery hours, the unopened days, the payout
  threshold and day. A book value staff cannot move is a constant with extra steps.
- HX2 (replaces HW6's "erase-now period"): an erase happens at once, as the code does; there is no period and no book
  value for it. The website's "gone for good within 24 hours" stands on that (at once is within 24 hours).
- HX3 (HW2): deleting a draft style removes its files and their bytes; an upload cannot be confirmed for a style that
  is gone; the sweep also takes a file whose style no longer exists.
- HX4 (HW2, T-62): when a creator's account is erased, an approved style that stays in the catalogue keeps the files
  it plays with (they are the catalogue's from then on, with no link to the erased person); the creator's drafts,
  their files and the profile picture are erased.
- HX5 (HW7): the staff session's per-section actions cover every staff write, drawn from the same table the guard
  checks (one source), so the two cannot disagree.

## HY (16 Nov 2026, the lead, on the Business Plan patch). Default (lead), owner may override.
- HY1 (HR1): a pending plan payment never traps the business for the hour it takes to lapse. Whoever may pay for the
  plan can continue it, and the business's owner can drop it from the Plan screen ("Start again"): the server marks
  it abandoned at once and a new start is allowed. If the provider later reports the dropped one paid, HU6 applies
  (fulfilled only if nothing else has paid for a plan since; otherwise refund due). Needs a server route (the next
  API round) and then the control on the Plan screen; until then the screen offers Continue and says when it lapses.
- HY2: the staff Support and Concierge lists take a search word, as the designed screens drew: Support by subject,
  name, email or wish number; Concierge by order number, who ordered, or a name on the order. Matching is the
  server's; the role's masking of contact details still holds in what comes back.
- HY3: every staff member who may hand a thread over can read whom to hand it to: a short staff list (id, name,
  role; no email, no sign-in detail), without the owner-only Team read.
- HY4: a Concierge order read carries its payment's id and provider reference for the roles that may read payments
  (others get neither), so the refund link opens that payment and no other.
- HY5: the maker of a Concierge order reads the buyer's wishes that belong to THAT order (id, wish number, the
  receiver's first name) to deliver them; never another order's or another buyer's.

## HZ (17 Nov 2026, the lead, on the eighth API round's check). Default (lead), owner may override.
- HZ1 (HY2): a search never widens what a role may learn. An email or a wish number matches only as the exact whole
  value (the characters % _ \ are ordinary letters, never patterns); a name or subject search treats them as
  ordinary letters too. Hit or no hit must not let a masked contact be rebuilt a character at a time.
- HZ2 (replaces HY5): a maker reads only the wishes TIED to their order. A wish is tied when it was delivered under
  the order (today's only tie). No list of the buyer's other wishes, in any state. OWED, a product gap (T-12 says
  Firstwish's team makes the wishes): there is no way yet for a maker to make a wish in the buyer's name through
  the order. Default (lead): a "make the wish" route on the order (the order's maker or the owner; the wish is the
  buyer's, tied to the order, hidden from the buyer until delivered) and the maker opening the wish maker from the
  staff Concierge screen. To be built as its own bundle; listed for the owner.
- HZ3 (HU6, HY1): a plan is never applied twice for one intent. When a plan payment settles and another plan payment
  of the same business was fulfilled AFTER this one was started, this one is refund due (said on its read), whatever
  state it was in (pending, dropped, lapsed). Paying again after the earlier one was fulfilled is a new intent and
  adds a month as HR1 says.
- HZ4: a pack is bought as a pack: a plan-payment start naming the pack is refused (422 with words).

## IA (17 Nov 2026, the lead, on the Vault check). Default (lead), owner may override.
- IA1: sending a reveal takes ONE wish from the pack and makes ONE reveal, or neither, whatever the path: a refused
  send, a lost answer, a retry, two tabs, a reload, back and send again. A shoot that already went to that client
  says so (when, the link) and sends again only when the business says "Send again". The web does what it can with
  the server as it is; the server gets one call that makes the wish and the reveal together (the ninth API round).
- IA2: the client's page at /r/<code> is not a new design. It is the receiver's page: the receiver's own passcode
  screen, the client wish's opening in the style and cover the business chose, then the photos, built only from
  parts the receiver's page and the wish engine already have. No plain grid of its own, no new look.
- IA3: "Use sample photos" is gone for good (no faked content). Picking files for a reveal and a download of the
  full set were drawn in the designed screens and come back when the server has them (the ninth API round).
- IA4: a reveal's passcode holds for every link to those files: copying the link never mints a way round it.

## IB (17 Nov 2026, the lead: the ninth API round, from the Vault check). Default (lead), owner may override.
- IB1 (favourites): a client at the reveal link, past the passcode where there is one, marks and unmarks photos with
  no account; marks belong to the reveal; the business reads them and cannot change them; marking is limited per
  link and address like any public write.
- IB2 (download): the reveal link gives a download address for each FINAL file (never a proof), signed and short
  lived, when the business left downloads on for that reveal (on by default for finals); "all" is the list of
  those addresses (the server makes no archive).
- IB3 (rename): a shoot's name and a file's shown name can be changed by the business; the stored object keeps its
  own name.
- IB4 (subset): a reveal names the files it shows; with none named it shows every ready file of the set, as now.
- IB5 (plays): a reveal's first play sets the client wish's openedAt and each play is counted on the reveal; the
  shoot shows the count.
- IB6 (HU5): a live login of a business gets Vault upload tickets as the owner does; a removed login never.

## IC (17 Nov 2026, the lead, on the ninth API round's check). Default (lead), owner may override.
- IC1 (IA4, IB2): a link to a reveal's files is never more open than the reveal it belongs to: its passcode, its
  downloads switch, its on or off and its end all carry to a copied or re-sent link. `again` keeps the passcode
  unless the business sets a new one. Another client's reveal of the same shoot is that client's own (the business
  chose its settings): not a way round.
- IC2 (IB1): a heart belongs to a FILE, never to a place in a list. A removed file's heart goes with it; the same
  files show the same hearts on a copied or re-sent link.
- IC3 (IA1): for one shoot and one client there is one reveal: the older send call answers "already sent" (409 with
  when and the link) like the new one unless asked again. A client wish the business makes by the older create call
  is an ordinary client wish and takes its wish; the screens send reveals by the one call only.
- IC4 (HZ2): a wish being made for a Concierge order does not exist for the buyer until it is delivered: not in any
  count, list or feed, 404 by its id on every route of theirs, and its public link opens for nobody. Delivery takes
  only wishes tied to THAT order, or the buyer's own wishes tied to no order.
- IC5 (IB5): plays are counted by the server's own view of who is playing (the link and the address, capped per
  hour), never by an id the client sends. A refusal names the real wait. An Idempotency-Key used again with a
  different body is refused (409), never replayed.
- IC6 (IB3): a name is plain text: control and direction-override characters are removed; a name of dots alone is
  refused.
- IC7 (HZ2, T-12, the next API round): a Concierge buyer gives the photos and the voice note WITH the order: files
  they upload for that order (when ordering and until it is delivered), theirs, tied to the order; the order's
  maker reads them and puts them in the wish; the maker uploads nothing in the buyer's name. Until this is built a
  maker can make a words-only wish; the Concierge screens for it wait.
- IC8 (IA1, on the Vault patch's second check): the web cannot make "one wish, one reveal" true by itself (two
  browsers, the next day, and a wish the business made on purpose all defeat it). The reveal form sends by the
  server's one call only (E-272); the web's own search for a left-behind wish and its cross-tab lock go. The Vault
  part merges after that.

## ID (17 Nov 2026, the lead, on the Maker pay check). Default (lead), owner may override.
- ID1 (money): a wish is paid for once. While a ticket payment for a wish is waiting, a start for any ticket of that
  wish answers 409 with words and the waiting payment's reference (the screen offers to continue it, or to drop it
  and choose again); the wish's owner can drop a waiting ticket payment at once (as HY1 does for plans; a late
  "paid" follows the next line). A ticket payment that settles when the wish already holds a paid ticket is refund
  due, said on its read and by email when refunded: never two tickets charged with nothing said.
- ID2 (HR2): after any payment for a ticket, however the person comes back (the provider's return, "Read the
  result", another browser), they land in the maker at the step that comes next: Sealed when the wish is sealed, the
  ticket step with the paid ticket shown and "Seal it" when it is not. A draft that holds a paid ticket says so
  wherever it is listed or opened ("Your ticket is paid. Seal it to send."), never "You pay only when it looks
  right."
- ID3: opening the maker on a wish that is already sealed shows Sealed, at any step address.
## IE (22 Nov 2026, the lead, on the tenth API round's check). Default (lead), owner may override.
- IE1 (T-13, IC7): a wish made for a Concierge order IS a Signature wish (the product truth says so): it is on the
  Signature line from the moment the maker starts it, paid for by the order (no ticket payment, no second ledger
  line), and holds what the price book gives Signature. What a buyer may give with an order is what one Signature
  wish can hold (the price book's photos and voices for Signature, times the order's count of wishes), never a
  number of its own: nothing a buyer is allowed to give can be impossible to use.
- IE2 (ID1): an id in a request is normalised on the way in (a UUID in lower case) before it is compared, stored or
  used as a key, in every payment start and wherever a subject id is taken; a spelling of the same id is the same
  wish.
- IE3 (IC7): files given with an order that is never paid are removed, rows and stored objects, 30 days after the
  order last changed (PROVISIONAL figure, in the price book's settings with the other file limits; the order
  itself stays). A refunded order reads as refunded, not paid.
## IF (22 Nov 2026, the lead, for the eleventh API round). Default (lead), owner may override.
- IF1 (the link, HU1): a payment start may name where the payer comes back to, as a PATH on our own site (it starts
  with one "/", is a path the web serves for that payment's subject, and is never an outside address); the server
  builds the provider's return from the site's own address, that path and the payment's reference. With no path the
  start behaves as today. A stranger paying at a link comes back to that link with a real provider too.
- IF2 (IE2): every route that takes an id answers a spelling that is not an id with 422 in words (never 500), and
  reads an id in any case as the same thing, on read routes too.
- IF3 (ID1): an extra is paid for once per wish as a ticket is: a start while the same extra's payment waits is 409
  with words and the reference; the owner can drop it.
- IF4 (the privacy page): a wish its owner removes can be brought back for the days the price book gives (30 today),
  then it is erased with its files by the erase job. The page's promise and the server agree.
- IF5 (HU4): the owner can turn a friends' link back on: the same link works again and the voices already given
  stay.
- IF6 (Now Showing and the catalogue): the public reads give what the designed pages draw and no more: a listed
  wish's style and title as they were at publish time; Now Showing by style; public wishes in a style; a creator's
  public profile (handle, name, picture, their approved styles and their listed wishes). "Featured styles" is NOT
  invented: if no staff screen or truth says how a style becomes featured, it is listed for the owner and not
  built.
- IF2a (22 Nov, the lead CORRECTS IF2, which was worded too widely): an id in the PATH that is not an id, or a
  payment reference in the path that is not shaped as one, answers 404 as it always has ("no such thing": the wired
  screens' not-found states, the live flows and 45 older tests read it so). An id in a BODY or QUERY field that is
  not an id is 422 in words. No spelling anywhere answers 500. Any case of a real id is the same thing on every
  route. IF2's "422 at every route that takes an id" is withdrawn for paths.
- IF4a (22 Nov, on the check of the eleventh round's second half): a removed wish that has a report still open is
  not erased at its day: it waits until the report is decided (an upheld one is the staff's take-down and stays; a
  dismissed one is then erased at once if its day has passed). An account's erase removes every friend's voice given
  to that account's wishes (the rows, the friend's first name and the stored files), as a single wish's erase does.
  A creator's public reads follow the creator's ACCOUNT, never a handle kept as text: a handle that changes hands
  never shows another person's styles.
## IH (22 Nov 2026, the lead, on the check of the twelfth API round). Default (lead), owner may override.
- IH1 (money): a style is tied to a creator's account only on proof that this account made it (a submission of that
  style by that creator). A handle proves nothing: handles change hands. A style with no proof stays untied: no
  royalty is routed for it, and staff get the list (style, the handle it carries) to tie by hand. Never a guess that
  could pay a stranger.
- IH2 (identity): a business's People and approved dates are the owner's, as before the twelfth round: a login
  reads and changes none of them, with the business header or without. A login may start the business's plan or
  pack payment (HZ3) and the answer is the same with the header and without it.
- IH3: the business header changes WHICH business a request acts on, never what a route answers: a business the
  caller is not in, and a header that is not an id, answer on every business route what the older business routes
  already answer for them (the lead's brief asked for 404 on the new ones: withdrawn, so the web meets one
  behaviour).
- IH4 (22 Nov, the lead, on the audit's loading rows): a public website page is built on the server and arrives
  whole (or as its kept copy): "loading" is not a state a person can meet on it, and its failure is the route's
  error page (rendered and checked on 22 Nov). The rows that ask for a reachable loading state on those pages, and
  the two that ask for privacy's and terms' "could not be loaded" words (reachable only when the site is built with
  the server down), are closed as not a state. Client-read screens keep their designed loading, empty and error
  states (rendered and checked).
- IH5 (22 Nov, the lead, on the check of the public reads bundle): which styles the site's menus and the Home
  styles row show, and in what order, is designed content (the owner's picks: Studio Noir, Love Letter, Golden
  Hour, Cinema, Owambe, Constellation, Boarding Pass in the menus), not sample data: it stays as designed, kept as
  ONE list of slugs in one place, and the server decides only whether each is on (a pick that is off is skipped and
  the next style in catalogue order takes its place; names and levels are the server's). A menu is never empty.
  When the owner rules how a style becomes featured, that rule replaces the list.
- II1 (22 Nov, the lead, on WEB-API-7's halt; Default (lead), owner may override): a style made in Studio plays on
  a receiver's phone only if the phone can read the style's document, so the document of a style that is APPROVED
  and live is public: at the wish's link (with the style's files, E-266) and at the public style read (E-196, for
  the maker's preview and the style's page). A draft, a submitted, a refused or a withdrawn style's document is
  never public (only its creator and staff read it). A wish already made in a style keeps playing at its link when
  the style is later switched off or its creator's account is erased (HX4: the customer's wish is theirs); the
  public style read stops giving the document once the style is off. The document given is the approved version,
  never a newer unsaved or unapproved edit.
- II2 (22 Nov, the lead; Default (lead), owner may override): a file the screening refuses carries a reason in the
  server's plain words, from a fixed list by the screening result's own kind (no new kinds invented; where the
  result gives no kind: "This file was not accepted."); a mark on a file that has been removed is refused (422 in
  words), never stored.
- II3 (22 Nov, the lead, on the check of the thirteenth round; Default (lead), owner may override): a wish made in
  a Studio style plays the version of that style that was approved when the wish was made; a later approved
  version changes new wishes and the public style read only, never a wish already made (the customer chose and
  paid for that look). The wish keeps a pointer to the approved submission it was made under.
- II4 (22 Nov, the lead, on the re-check of the thirteenth round; Default (lead), owner may override): a file that
  an approved version of a Studio style names stays playable for as long as that version can be played (the public
  style read while it is the newest approved, and every wish made under it). When its creator deletes it while
  editing, it leaves the creator's draft and file list and no longer counts against the draft's limits, but the
  stored file is kept and still given at the links of the wishes made under that version. It goes for good only
  when no approved version that can still be played names it.
- II5 (22 Nov, the lead, on the check of the Studio files bundle; Default (lead), owner may override): a Studio
  style's document may name only files of that same style that belong to its creator and have passed screening.
  A save or a send-in that names another creator's file, another style's file, a file still being checked, a
  refused file or a file that is gone is refused in words that name the place; nothing is saved. A style already
  saved with such a name still opens, and cannot be sent in until the name is removed.
- II5a (22 Nov, the lead, on the check of the fourteenth round; it narrows II5; Default (lead), owner may
  override): II5 is about a file being USED. A style's art list is the creator's shelf: it may hold the style's own
  files in any state (still being checked, refused), and a save is never refused only because the shelf holds one;
  it may not hold another creator's file, another style's file or a file that is gone. A USE of a file (the poster,
  the sound, a scene's background, an artwork, a 3D model in any shape the editor writes it, a picture fill) needs
  a file that has passed checking. A send-in is refused in words while anything on the shelf has not passed
  checking (the creator waits or removes it), so an approved document never carries an unchecked file. A value
  that is neither an art item's id nor shaped like a file id names no file (a house bank piece, an older item):
  it is left alone.
- IJ1 (23 Nov, the lead, on the check of the creator style at a link; Default (lead), owner may override): the
  web's gate marks the sample wish in style previews as a debt to remove, not a design to extend, so a creator
  style's preview adds NO new use of it: in the maker a creator style is previewed with the wish being made (the
  person's own photos and words), and on its public page it plays with no photos (its own fallback frames),
  both marked as a preview. When sample wishes are served by the server as reference data (planned with the rest
  of the old rule breaks), every preview, house or creator, reads them from there.
- IJ2 (23 Nov, the lead; Default (lead), owner may override): a creator's style follows the same two rules as a
  house style when a wish takes it: it must be offered for the wish's kind, and its level must be one the wish's
  ticket allows (product truths T-02 to T-05). The server refuses the choice in words otherwise; the web never
  offers it.
- IJ3 (23 Nov, the lead, on the check of the fifteenth round; Default (lead), owner may override; a refund rule:
  listed for the owner): the premium-style extra cannot be refunded on its own while the wish still holds a style
  that needs it: the refund is refused in words that say why. Before sealing the person (or staff with them) picks
  a style the ticket allows first, and then it can be refunded; after sealing the look is the customer's and the
  extra stays paid. A refund of the whole purchase follows the existing whole-refund rules.
- IJ4 (23 Nov, the lead; Default (lead), owner may override): IJ2's kind rule holds wherever a wish's kind or style
  is set, also when the KIND changes with a style held (refused in words unless the style is offered for the new
  kind or is replaced in the same change) and when the server picks a style itself (a new wish, a business draft,
  a Concierge wish): it picks the first style that is on, offered for that kind and allowed by the ticket (the
  starter level where there is no ticket yet). The list of styles a wish may take (`allowedStyles`) says exactly
  what a save would accept: level AND kind.
- IJ3a (23 Nov, the lead, on the re-check of the fifteenth round; Default (lead), owner may override): an extra
  whose refund has been sent no longer counts as held, from the moment the refund is sent: while that refund is
  open the wish cannot take a style that needs the extra (refused in words that say a refund for it is on its
  way), so nobody ends with the premium style and the money back.
- IJ4a (23 Nov, the lead, on what the harness task found; Default (lead), owner may override): a style is "offered
  for a wish" by its kind AND, where the style names occasions for that kind, by the wish's occasion (the same
  rule the public styles list already answers by). The server's own pick, the save, the seal, the ticket start and
  `allowedStyles` all use that one rule. A wish with no occasion yet is offered only styles that name no occasion
  for its kind; an occasion change with a style held is re-checked like a kind change. (Seen: the server picked
  Quiet, an apology-only style, for a love birthday wish; the maker then rightly kept Continue off.)
- IJ4b (23 Nov, the lead, on the check of the seventeenth round; Default (lead), owner may override): a wish that
  took a style while the style was offered for its kind and occasion keeps it when staff later narrow that
  style's kinds or occasions, exactly as it keeps a style whose level staff later raise (IJ2): the seal does not
  refuse it and its link plays. The change applies to wishes that take the style afterwards.

## 23 Nov: the three rows a verifier found still open (UA-808, UA-725, UA-922). Default (lead), owner may override.
- IK1 (UA-808, blocker found by VERIFY-UA-725-808-922): a wish whose opening is a passcode or a question holds a secret the
  SERVER stores hashed (Q8, GG7). The web sends it only as the write-only body field `passcode` of the draft save, never
  inside content; the hint and the question's text stay in content.opening.values (LL3). The server refuses to SEAL a wish
  whose opening needs a secret and has none (422, words naming the step), so a wish is never sealed "locked" and open to
  anyone. Changing the opening to one with no secret clears the stored hash.
- IK2: a question's answer is matched without regard to case or outer spaces (the maker says "Not case sensitive"); a
  passcode is matched exactly as typed.
- IK3 (UA-725): the portrait video extra is NOT SOLD while no video renderer is configured: its payment start is refused
  with words and the wish read says the extra is not available, so the app draws no offer (law: sold is built). With
  PROVIDERS=standin the stand-in renderer is bound (with a failure switch, refused at boot with live providers) so a
  test stack reaches "ready" and "failed". Production keeps "no renderer" until the real one is built: OWED, its own
  task (listed to the owner).
- IK4: a wish that holds the video extra is never offered it again at a price: it shows the video's state (asked, being
  made, ready with a download, failed with Ask again). The ready state gives a short-lived signed download address.
- IK5 (UA-922): the Studio's save checks a style document's base look against the server's known looks and each
  scene's layout and added kinds against the allowed lists (422 with words naming the field); the send-in check does
  the same, so the browser's word is not taken. Colours the editor reports (doc.seen) are advice for the editor only:
  no server rule reads them (say so in the contract note).
- IJ1a (23 Nov, the lead; Default (lead), owner may override): the web no longer holds the sample wishes (IJ1,
  W15C-S1 merged), so the exporter's "first export" of SampleWish from the web's adapt.ts can never run again. The
  seed file prisma/seed-data/SampleWish.json is the API's own data (GD3): the exporter never writes it; when the file
  is missing it stops with words that say to restore it from git, and writes nothing. The older test of the first
  export is restated to that (its "one row for each kind and occasion of the web's catalogue" check stays, read
  from the file).
- IK2a (23 Nov, the lead, on the two checks of the secret; Default (lead), owner may override; replaces IK2's
  "exactly as typed"): outer spaces are cut from a passcode and from an answer when they are set AND when they are
  tried (phone keyboards add a space); what is left must be 4 to 64 characters (a secret of spaces only is refused
  422). An answer is also matched without regard to case and in one unicode form (NFKC, then lower case); a
  passcode keeps its case.
- IK3a (23 Nov, the lead, on VERIFY-API-BASE-19 H1; Default (lead), owner may override): IK3 covers EVERYTHING whose
  price includes the portrait video, not only the extra: a ticket level (Signature, Premiere today), a plan or a
  bundle whose entitlements include it is not sold while no video renderer is configured (the same refusal and
  words; the offers a person reads show it as not available). What tickets include is the owner's and is not
  changed. So on the real server the top two tickets cannot be sold until the real video renderer is built: the
  renderer is a RELEASE BLOCKER (listed to the owner; its own task before Phase 8).
- IK4a: a wish that was erased gives no video read and no download (404, like every other read of it); an extra
  whose refund was SENT (IJ3a) gives no download either.
- IK5a (replaces IK5's last sentence): the send-in's "readable" check reads the colours the editor reports
  (doc.seen); that is advice for the staff reviewer, who approves every style before it goes live; no style goes
  live on that check alone. The contract note says so.
- Accepted lows of that check (no real rows exist; nothing wired is released): a wish sealed before round 19 with a
  passcode opening and no hash; an answer hashed before IK2a opens only as typed; an old Studio draft with an
  unknown base reads but must be mended in its next save.
- IK6 (23 Nov, the lead, on build/tasks/RENDERER-PLAN.md; Default (lead), owner may override): the real video renderer
  is a headless browser on our own server that plays the web's own player at 1080 x 1920, 30 frames a second, on a
  stepped clock, encoded by ffmpeg (the way the style previews are already recorded); no outside render service. The
  file is silent; a status video is at most 30 seconds, cut at a whole scene; the file of a resting wish at most 60;
  the ending's question is drawn unanswered; a passcode wish's video shows the wish without its lock and only the
  owner can get it, and the ask says so. The render reads the wish through a one-use token of minutes, stored hashed.
  A "Premiere clip" render is not built and not sold. OWNER QUESTION kept: T-49 says the receiver of a resting wish is
  also offered the file; until answered the file is the owner's only.

## 23 Nov: API-BASE-20 (what a wish holds; a possible second charge). Default (lead), owner may override. Registry reopen DEC-318 to DEC-321, frozen DEC-322.
- IL1 (DEC-318): an extra a wish already holds, bought or included in its ticket (the ticket's own grant has what the extra gives: read from the price book), is
  refused at the payment start in words with no payment row; the one extra that may be bought again is five more photos (T-30: each adds five). The premium
  style, the portrait video, the QR card and both clips are held once. The 15-second clip is not repeatable because the server counts no clips (owner may
  override, with a clip count). An extra the ticket includes answers "This ticket already includes that extra. Nothing more to buy." Twenty starts at once: one.
- IL2 (DEC-319): the owner's wish read (single and list) carries `adds`: each extra held, from its ticket or a purchase, with a refund's state (sent or done).
- IL3 (DEC-320): GET /v1/ticket-offers answers a signed-in person for `wish` (their own); every ticket says canBuy, reason and words, by the start's own rules.
- IL4 (DEC-321): a kind or occasion move that sends no style picks one by the new-draft rule; a named style is judged as before.
- IL1 to IL4 (above, written by round 20's builder) were checked by a separate verifier on 23 Nov ("the code does what
  they say") and are ADOPTED by the lead. Default (lead), owner may override.
- IL1a (23 Nov, the lead, on that check's finding 2; Default (lead), owner may override): the SERVER enforces the video
  clips it sells (T-05, T-08, T-30), read from the entitlements book: Premiere holds three clips of up to 15 seconds
  and is the only ticket with clips; the extra "one more 15-second clip" adds one (held once); the extra "a long
  clip" allows one clip of up to 60 seconds (held once). A clip's length is read from the file, never taken from
  the browser. A wish holding more or longer clips than its ticket and extras give is refused at the upload, the
  ticket start and the seal, in words that say what to remove. (Until round 21 lands only the website limits clips.)
- IK7 (24 Nov, the lead, on R4's stop; Default (lead), owner may override): a TEST stack may learn a render token, the
  way it learns a sign-in code from the stand-in mail outbox: with PROVIDERS=standin and NODE_ENV not production
  (refused at boot otherwise, like STANDIN_MAIL_OUTBOX) the stand-in renderer writes each run's token to the file
  named by STANDIN_RENDER_TOKENS (mode 0600) and, with STANDIN_VIDEO=hold, waits until the token is spent (or the
  abort, or a cap) before it writes its marked file, so a page can read while the job is still rendering. No route
  mints a token; the real server never writes one anywhere but the row's hash.
- IK6a (24 Nov, the lead, on the check of the render page; Default (lead), owner may override; replaces IK6's "at most
  30 seconds"): a status video is at most 60 seconds (WhatsApp's status takes a minute by the public reports read on
  24 Nov; some say 90 seconds is rolling out; no official page was found: so 60), and the file is kept small enough to
  send (aim under 16 MB). A wish whose own play is longer than the limit keeps its opening and its ending whole and
  loses whole scenes from the middle, cut at scene ends; it is never cut off before its ending.
- IK7a (24 Nov, the lead): the stand-in's hold is asked for by a test, not set for a whole stack: STANDIN_VIDEO=hold
  holds a render only while the file named by STANDIN_RENDER_HOLD_FILE exists (a flow makes it before its asks and
  removes it after); with no such file every other flow's video is made at once, as before.
- IK8 (24 Nov, the lead, after the render page's second and last fix round; a ruling, not a new round): R4 is MERGED
  as it stands, because what real people see is proven unchanged (a receiver's view before and after on twenty
  styles and seven endings, by the builder and by a separate verifier) and the render page is opened by nothing
  until a real renderer exists (IK3: nothing that includes the video is sold). What is NOT finished is RE-CUT as
  its own task, R4C, and it gates the renderer's release proof (R9): the render sweep must cover all 43 house
  styles and every ending of each (it read only the first page of 20); every one must reach done under the render
  page with nothing pressable and no action word (today owambe and harvest-light with the envelope do not finish,
  and mosaic draws the word "hold").
- IM1 (24 Nov, the lead, on API-BASE-22's findings; Default (lead), owner may override): a photo a person gives us
  must never carry their position to someone else. The file a receiver, a friend or the public is given is always
  free of metadata (no GPS, no camera serial): the server makes a clean copy when the upload is confirmed and
  serves that (or a sized copy of it); the untouched original is never served to anyone but its owner, and the
  web shows sized copies (w320, w768, w1600), not originals.
- IM2 (24 Nov, the lead): a photo kind the server cannot open cannot be accepted: HEIC is taken out of the kinds the
  upload accepts (the server's rule and the web's file picker), so an iPhone hands over a JPEG as it does for any
  site that does not ask for HEIC; a HEIC sent anyway is refused in words that say to send a JPEG or PNG. (No
  HEIC decoder ships with the image library; adding one is a licence matter.)
- IK6b (24 Nov, the lead, on the recorder's hand-back; Default (lead), owner may override): a wish's opening and its
  ending stay whole in the video even when the two alone pass the asked length (as built: an 8 second ask on a film
  gave 12.2 seconds). At the real limit of 60 seconds no style may have an opening and ending that together pass
  it: the render sweep (R4C) and the real-host proof (R9) measure this, and a style that does is a fault of that
  style, fixed there, never a cut-off ending.
- IK6c (24 Nov, the lead): the server does not need a checkout of the website to record. The website serves its own
  stepped clock as a plain file under the render path; the recorder reads it from the web origin at each render
  (pinned by its hash when one is set). Built with the wiring (R6) and a small web change.
- IK6d (24 Nov, the lead, on the check of the recorder; Default (lead), owner may override): the recorder's browser may
  reach only the listed hosts, matched by host AND port (an entry with no port means that scheme's own port only). A
  WebSocket, WebRTC and WebTransport are never allowed (the render page needs none), whatever the list says. The
  metadata address is blocked in every written form (IPv4, IPv4-mapped IPv6, decimal).
- IK6e (24 Nov, the lead; replaces IK6c's detail and the check's "the pin must be required"): the website serves the
  clock's page script (the text of CLOCK_SHIM only: a script for the page, never code the server runs) at
  /render-clock.js; the recorder fetches it from the web origin at each render (size cap, the allow-list), and BEFORE
  it records it checks the clock in a blank page: k steps move Date.now and performance.now by exactly k steps and
  fire the frame callback exactly k times; a clock that fails is "clock drift" and nothing is recorded. The hash pin
  stays, optional. Why not a required hash: it would stop every recording at each website release that touches the
  file until someone changed a setting. No code fetched from the website is ever run by the server itself.
- IK6f (24 Nov, the lead): a recording is repeatable: the clock freezes from the first script at virtual time 0 and
  at a wall time the recorder gives (the render job's own start, to the second); two renders given the same wall
  time and content give the same frames. An error thrown in a stepped timer or frame callback is a page error: the
  recording fails, never a video handed out as good.
- IM1a (24 Nov, the lead, on round 23's hand-back; Default (lead), owner may override): the clean copy REPLACES the
  upload: no untouched original is kept anywhere. A JPEG or WebP is saved again at quality 92, turned upright; a
  picture the server cannot open is refused at upload, in words.
- IM3 (24 Nov, the lead): a voice, a clip and a Studio media file carry location and device tags too (seen with
  ffprobe on an m4a and an mp4). They are removed at confirm by ffmpeg without re-encoding (the server already needs
  ffmpeg and ffprobe for clip lengths and the video maker); a file ffmpeg cannot rewrite is refused in words. Until a
  stored file is clean it is handed to no one but its owner, as for photos.
- IK6g (24 Nov, the lead, on the second check of the recorder; Default (lead), owner may override): nothing plays
  before the recording starts: the page's clock stays at exactly 0 until the page says it is ready (only work that
  is already due is run); the first frame is the wish's first moment. A picture or font that never arrives fails the
  recording with words inside the time limit: a video with a hole is never handed out. The recorder's browser is
  driven through a private pipe, never a listening port, and its proxy asks for a secret made for that one
  recording: no other program on the server can read the wish's token or use the proxy. If the server program dies,
  the browser dies with it.
- IK6h (24 Nov, the lead, after the recorder's second and last fix round; Default (lead), owner may override): no
  third fix round. The recorder (branch r5, 725d21c) is re-cut: (a) a SHORT re-check by a separate verifier of the
  round's claims that can be tested without a real wish (the private pipe, death with the server program, a
  missing picture fails, the proxy's secret, plain words); on a pass, r5 merges; (b) what is still open moves to
  its own tasks: a real wish is still not frame-for-frame repeatable (106 of 160 frames; cause not found: it looks
  like an entrance animation that starts by real time in the web's render page), and a Studio wish never says
  ready while the clock stands at 0 (it waits on a 120 ms interval: web components/engine/made/StudioHost.tsx:96,
  conduct.ts:61): a web task (the render page becomes ready with no time passing; every entrance starts from the
  stepped clock) and then one recorder follow-up. Until then a Studio wish's video fails with words; it is never
  handed out wrong. The video stays unsold (IK3) until R6 and R9 anyway.
- IK8a (24 Nov, the lead, on the check of the 43-style recording test): under the render page nothing that only
  makes sense to a person holding the phone is drawn: cue words in any wording ("Touch the star"), send arrows and
  reply bars, pull cords, page counters and progress pips ("04 / 04"), and no empty shape is left where one was.
  The sweep's word list cannot see pictures: its check always includes a person-like look at real frames.
- IK6i (25 Nov, the lead, second chat, on the merge check of r5: test V7 in test/identity/int1-rulings.spec.ts failed; Default (lead), owner may
  override): server time comes only from the Clock port, so the recorder's default start time (chromium-video-renderer.ts:517) is read from the
  Clock port, never Date.now(). The script text the recorder sends INTO the browser (the clock self-check, :649-650) is the page's own time, which
  the stepped clock is there to control; V7 does not govern it. It is written so it does not spell the server call (for example `Date.now` held in
  a page-side name), with a comment saying it runs in the page. V7 itself is not edited. Executed by patch P3-R5 (no verifier: 30 lines or fewer,
  the lead reads the diff, the merge check runs the whole suite again).
