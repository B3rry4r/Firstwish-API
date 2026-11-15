# Phase 5: the API in bundles (cut 15 Nov from the frozen registry; adjust names to .pipeline/schema-map.json once the schema is merged)
One builder per bundle (opus), a separate verifier (sonnet lean at T1; full with the money attacks at T2), at most 4 heavy agents.
Each builder gets: its resources' contracts (tools/pipeline/show.py <Resource>), conventions.md, src/contracts, the stack script, the test kit.
Order: a bundle starts when the ones it stands on are merged. T2 = money, identity, deletes, third parties.

| id  | tier | bundle | resources (registry names) | stands on |
|-----|------|--------|----------------------------|-----------|
| B01 | T2 | Sign-in | AuthCode, Session, ExternalIdentity (Google), Account (create on first sign-in, GET/PATCH /v1/me, mode) | schema |
| B02 | T2 | Account and sides | Account (handle, sides, erase on request, sign out everywhere), Creator, Business (profile), Follow | B01 |
| B03 | T2 | Staff and audit | StaffAccount, StaffSession, RoleAccess, staff sign-in, AuditEntry (the one write helper every staff action uses) | schema |
| B04 | T2 | Price book | Price, PriceBookVersion, Promotion, LifecycleConfig, Entitlements, TicketOffer (quote), GET /v1/price-book, admin prices, payout threshold | B03 |
| B05 | T2 | Payments core | Payment (start, verify, list), WebhookEvent (Paystack, signature, replay), LedgerEntry, idempotency, the fulfilment-handler frame | B01, B04 |
| B06 | T2 | Wish core | Wish (draft create/patch, content document, seal, list, detail), WishTransition (server state machine), WishNumberSequence, WishLink, Job, JobRun (unlock, rest, erase, notices due) | B01, B04 |
| B07 | T2 | What a payment buys | fulfilment per line: ticket, extras, keep and wake (Wish), the Pass (PassMembership), Pro plan and wish pack (Business, ProUsage), Vault space, creator plan and credits (CreatorState) | B05, B06 |
| B08 | T2 | Refunds and the ledger check | Refund, Reconciliation, LedgerDay, the daily settlement job, admin payments | B05, B03 |
| B09 | T2 | Files | StoredFile, UploadTicket, SignedUrl (one S3 port: R2 or Spaces), ScreeningResult, VoiceNote, VaultFile | B01 |
| B10 | T2 | The receiver's link | PublicWishView (GET /v1/w/:slug, passcode tries, sealed shows nothing), WishOpen, Reaction, Share, PlayWish | B06, B09 |
| B11 | T1 | Notices and email | Notice, MessageDelivery, MessageTemplate, NoticePrefs, the Resend adapter, admin messages | B06, B03 |
| B12 | T1 | Dates and saved | DateRow, ApprovedDate, SavedWish, Person (people a sender keeps) | B01 |
| B13 | T1 | Now Showing and moderation | PublishRequest, PublishedWish, DayPick, Report, Ban, admin moderation and showing | B06, B03, B09 |
| B14 | T1 | Styles | Style, StyleLevel, StyleRate, Template, Event (preview played, paid in a style), admin styles | B03 |
| B15 | T2 | Studio | StudioStyle (document), StudioPrefs, CreatorState, StyleSubmission, AiRequest (AI port, credits), admin style review | B02, B07, B09 |
| B16 | T2 | Creators' money | RoyaltyAccrual, EarningsSummary, Payout, BankAccount, the monthly payout run, admin creators | B05, B14 |
| B17 | T2 | Business | Business (plan, usage), ProUsage, ClientWish, Invoice, Login (extra logins) , admin businesses | B02, B07 |
| B18 | T1 | Vault | Shoot, VaultStorage, RevealLink, RevealPlay (with B09's VaultFile) | B17, B09 |
| B19 | T1 | Concierge, cards, video | ConciergeOrder, Maker, QrCard, RenderJob | B06, B03, B09 |
| B20 | T1 | Support | SupportThread, SupportMessage, SavedReply, ThreadCounts, the inbound email webhook | B11 |
| B21 | T1 | Staff reads | Overview, Numbers (and targets), Queue, Settings, Provider, admin wishes and people (actions, masked contact, contact reveal) | B13, B08, B20 |

After Phase 5: Phase 6 wires the 89 screens (bundles of 3 to 5 by area, from .pipeline/ui-align-tasks.json), with the R10 gate (no browser
store) as the exit; Phase 7 smoke; Phase 8 live gate.

## Current state
- 15 Nov ~22:50 UTC: wave 2 MERGED into the API branch (f755607): B04 prices, B09 files, B02 account, B14 styles, B12 dates,
  on top of identity (B01, B03). 7 of 21 bundles in. Registry DEC-167: 106 resources, 237 endpoints. 459 tests.
- Built, under check (Sonnet): B05 payments (b05-payments), B06 the wish (b06-wish-core). Both branch from int-2.
- Every agent is Sonnet (R17). Briefs to write next: B07, B08, B10, B11, B13, B15-B21.
