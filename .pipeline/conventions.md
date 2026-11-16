# Conventions (Phase 0). Every agent reads this. Lines marked D are "Default (lead), owner may override"; lines marked O are owner rulings.

## Stack
- O NestJS (TypeScript strict, Node 22). D PostgreSQL 16 with Prisma and its migrations. D Redis + BullMQ for timed work.
- O Front end: the existing Next.js app on Vercel. D API host on DigitalOcean; API base `/v1`; public name api.<site domain>.
- Layout: `src/<resource>/` with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `tests/<resource>.contract.spec.ts`.
  Shared code in `src/common/` (guards, decorators, filters, ports) is owned by the schema and pre-step agents only.
- Validation: class-validator DTOs; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.

## Who can do what
- One account, up to three sides: person (always), creator (a public profile), business (owner or member of one business).
- Staff are separate: roles `owner`, `ops`, `moderator`, `reviewer`, `support`, `finance`, `maker` (Concierge). Staff routes live under `/v1/admin`.
- A receiver has no account: a wish is reached by its link; what the link returns is decided by the server (sealed, countdown,
  passcode, question, open, resting, gone). The server holds the content until the wish may open; the phone's clock is never trusted.
- `@Roles(...)` + `RolesGuard`; ownership checks in the service (a person reads only their own wishes; a member only their business).

## Signing in
- O No passwords. Sign in by a one-time code to an email, or Google sign-in (R11; phone sign-in removed). Codes: 6 digits, 10 minutes, 5 tries, rate limited.
- D Access token: JWT, 15 minutes, `Authorization: Bearer`. Refresh token: rotating, 30 days, httpOnly Secure SameSite=Lax cookie on the API host,
  refreshed at `POST /v1/auth/refresh` (public by its cookie, no bearer: T3). Each sign-in starts a session FAMILY (one device's chain).
- D (V1) An access token names its session family and is good while that family lives: rotating the refresh token does not end the
  access tokens already given (a second tab and parallel requests keep working). Sign-out and a detected theft end the family at once.
- D (V2) Refresh has a grace of 10 seconds: the same rotated token sent again inside it gets the SAME new child (one rotation, many
  identical answers), never a 401 and never a cleared cookie. (T4) After the grace, a reused rotated token ends that session family
  only; the account's other devices stay signed in.
- D Staff sessions follow the same rules (S5, V1, V2): `POST /v1/admin/auth/refresh` by the staff cookie, 12 hours from sign-in.
  One access-token issuer and verifier (src/common/auth): a token with audience "staff" is checked as staff, any other as a user,
  and each side refuses the other's token (S1).
- CORS: only the site's own origins, with credentials.

## Shapes
- Errors, everywhere: `{ "error": { "code": "snake_case", "message": "plain words", "fields"?: { name: "why" }, "requestId": "..." } }`.
- Lists: cursor pagination, `?cursor=&limit=` (limit 1 to 50, default 20); response `{ "items": [...], "nextCursor": string | null }`.
- Routes: kebab-case nouns, plural (`/v1/wishes/:id`, `/v1/styles/levels`). Actions as sub-resources (`POST /v1/wishes/:id/seal`).
- Writes that take money or send something accept an `Idempotency-Key` header; a repeat returns the first result.
- Starting a wish (`POST /v1/wishes`) takes an optional `Idempotency-Key` too (HM3): the same key answers the same draft; a person's untouched draft is handed back (200) instead of a new one.
- Error codes the web branches on: `unauthorized` (an ended, reused or erased session; words kept), `no_session` (a refresh with no cookie or a malformed one, HM6: 401, nothing to say to a first-time visitor), `stale_version`, `wish_locked`, `order_changed`, `idempotency_key_reused`.

## Identity and format canon (the server normalises on ingest; it never trusts the client's spelling)
- Phone: an optional plain detail, never verified and never an account key (O R11); stored E.164 (`+2348031472093`) when given, default country Nigeria.
- Email: trimmed, lowercased. Handle: lowercased, a leading @ dropped, `[a-z0-9._]{3,20}`, starts and ends with a letter or number, no two dots or underscores together, reserved words refused (the app's rule, components/app/feed/spaces.ts; R5).
- Money: integer kobo, currency `NGN`, never a float, never a formatted string on the wire. Prices are read from configuration tables, never hardcoded.
- Time: ISO-8601 UTC on the wire. Date-only: a calendar date (birthday, wedding day, pack end) is a `YYYY-MM-DD` string, not a timestamp (Phase 3 ruling C-29). A wish's opening moment is stored as an instant plus the receiver's IANA time zone.
- Ids: UUIDv7 strings. A wish also has a public link slug (a readable part plus 4 random characters) and a wish number (issued in order by the server).
- Kinds, occasions, styles, tickets, extras: the slugs the web app already uses (lib/catalog.ts, lib/occasions.ts, style manifests).

## Things that are not plain requests
- Files (photos, voice notes, Vault shoots, video clips): the browser uploads straight to storage with a signed URL the API issues, then confirms.
  O Storage is one port with two adapters, Cloudflare R2 and DigitalOcean Spaces (both S3-compatible), picked by configuration. Buckets are
  private; reads use short-lived signed URLs; image sizes are made on upload.
- Payments: Paystack (start, verify, webhook with signature check). Every kobo that moves is a ledger row; the ledger must equal the provider.
- Messages: one port each for SMS, WhatsApp and email. D Providers not chosen yet (owner item): tests use stand-ins.
- AI writing (letter and reasons from a voice note, Studio drafting): one port; D Anthropic API (owner key). Never answered by a fake in production.
- Timed work: opening at the moment, the three-day notice, resting at term end, erasing after 12 months at rest, restore window of 30 days,
  date reminders, Pass and plan periods. All by queue jobs with a recorded run, never by a page being open.
- Webhooks in: Paystack, the message provider's delivery receipts. Signature checked; no user role.

## Runtime contract (the web app)
- Connectivity: none. The app is always-online; D no offline mode. A failed request shows the surface's error state with a retry.
- The app keeps data in the browser's localStorage today (accounts, wishes, drafts, Studio, business data). After wiring, the server is the
  only truth. O R10: nothing is kept in localStorage, sessionStorage or IndexedDB. The session is an httpOnly refresh cookie plus an in-memory access token;
  light/dark mode is a field on the account; choices made before sign-in travel in the link. The build fails on those three words in app/, components/, lib/.
- Refresh triggers: on page load, after sign-in, when the tab becomes visible again, and after any write. A manual button is not a trigger.
- Every data surface has four states: loading (the app's own skeleton), empty, error (with retry), and loaded.
