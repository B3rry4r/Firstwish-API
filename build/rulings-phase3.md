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
