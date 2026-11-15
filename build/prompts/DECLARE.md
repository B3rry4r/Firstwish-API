You are the Phase 0 declarations agent. Read-only on all code. Your only outputs, all under /home/user/Firstwish-API/.pipeline/:
`declared/<resource>.json` (one per backend-only resource), `supersedes.json`, `decisions.json`, `env-manifest.json`. Do not commit or push. Budget ~90 steps.

Read first: the schemas for declaration fragments, supersedes, decisions and env-manifest in
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/references/schemas.md (follow them exactly);
then /home/user/Firstwish-API/build/rulings.md, .pipeline/conventions.md, .pipeline/product-truths.json, .pipeline/stubs.json, and the summary
keys of .pipeline/scan-map.json (localPersistence, seedSources; do not read all 66 screens). Prices and terms: /home/user/Firstwish-web/lib/catalog.ts
(tickets, extras, pass, concierge), lib/account.ts (TERM_DAYS, KEEPS, HOLD_DAYS, RESTORE_DAYS), lib/pro-data.ts (PLANS, VAULT), lib/studio.ts.

1. Declarations: what the backend needs that no screen shows. Same fragment schema as screen extraction, `sourceScreens: []`, provenance
   `declaration`. Describe entities, fields and behaviour; name no framework code. One file each for at least:
   - auth-codes (one-time codes by phone or email, attempts, rate limits), sessions (rotating refresh tokens), google-identity, staff-accounts and roles
   - wish-link (the public link: readable part plus 4 random characters; what the link returns in each state; the server decides, never the
     phone's clock), wish-lifecycle (draft, sealed, live from first opening, resting at term end, kept or woken, erased after 12 months at rest,
     deleted and restorable for 30 days; wedding terms count from the wedding date), wish-number (issued in order)
   - payments (Paystack: start, verify, inbound webhook with signature check, idempotency), ledger (every kobo; equals the provider), refunds,
     price-book (tickets, extras, keeps, Pass, Pro plans, Vault space, creator plans, the 40% off and the date it ends; changed only by staff, audited)
   - storage (one port, two adapters: Cloudflare R2 and DigitalOcean Spaces; signed uploads straight from the browser, confirm step, private
     buckets, short-lived signed reads, image sizes made on upload), upload-screening (photos checked before a wish can be published)
   - messages-sms, messages-whatsapp, messages-email (ports; templates; delivery log; inbound delivery receipts), notices (the scheduled ones:
     opened, three days before a term ends, the anniversary, date reminders 7 days and 1 day before, Pass and plan periods)
   - jobs (the queue: open at the moment, rest at term end, erase, restore window, reminders; each run recorded)
   - ai-writing (letter and reasons from a voice note; photo picking; Studio drafting; credits spent; never answered by a fake)
   - video-render (portrait video for WhatsApp status; Premiere clips), qr-card (a print-ready card file for a wish; table cards for planners)
   - moderation (reports, takedown "This is me, take it down", bans), now-showing review, style-review (creators' submissions, placement at a
     level), style-levels (staff move a style; lib/levels.ts already names GET /v1/styles/levels), royalties and payouts, concierge-orders,
     support-threads, audit-log, analytics events (the eight earning lines, preview to paid, opens)
   For each third party: direction (outbound calls, inbound webhooks), the env vars it needs (append to env-manifest.json), and that tests use a stand-in.
2. Supersedes: where the front end as built is wrong against the target state. One entry each (as-built evidence with file:line, target, reason,
   approvedBy "Default (lead), owner may override" unless a ruling in build/rulings.md decides it: then cite the ruling). At least:
   money as naira text or floats -> integer kobo; ids made in the browser -> server UUIDv7; wish numbers made in the browser -> issued by the
   server; the share link `/w/mine?id=<local id>` -> the public link; opening decided by the phone's clock -> decided by the server; sign-in
   accepting any six digits -> real codes; Google button that only continues -> real Google sign-in; payment that confirms after 700 ms -> Paystack;
   every localStorage store (fw-account, fw-maker, fw-voice-*, fw-pro, fw-vault, fw-feed, fw-studio, fw-pass-at) -> the server, with only the theme,
   a remembered tab and an unsent draft kept locally; photos and voice notes as data URLs -> uploads to storage; "40% off until 31 January" with
   no date check -> the price book's end date; the "Show sample wishes" switch saving fabricated data into a real account -> removed from
   production (house showcase wishes are served by the server); phone numbers as typed -> E.164 normalised by the server.
3. decisions.json: every default above as "Default (lead), owner may override" with options considered, evidence and confidence. Any number you
   would have to invent (a rate limit, a cap, a threshold the documents do not give) is marked PROVISIONAL with owner "owner"; never invent a price.
Hand back in at most 12 lines: files written (counts), every PROVISIONAL number, and anything only the owner can decide.
