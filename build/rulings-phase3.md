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
