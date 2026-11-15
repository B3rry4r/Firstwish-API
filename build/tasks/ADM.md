# ADM: the admin dashboard (staff only), screens first

Owner (15 Nov 2026): "The admin dashboard, I've not seen what it looks like. I've only seen business ... creator ... the normal user ... the
main landing page. What about the dashboard? Please design the whole dashboard thing and let me see. Then proceed with the integration."
Earlier (13 Nov): "in the future ... admins are also able to edit and move which styles between premium, standard, or the first".

What the documents say staff must be able to do (docs/product/*.txt): review every public wish before it is listed, after automatic
screening; take a wish down in minutes ("This is me, take it down"), act on reports within 24 hours, ban accounts; review and place every
creator's style, move styles between levels on evidence; refund a paid wish that failed; pay creators monthly past a threshold; run Concierge
orders (one maker per order, a sheet of names becomes a wish each, delivery dates, an opened report); support by WhatsApp and email;
watch the eight earning lines (tickets, extras, keeps, the Pass, Pro plans, Vault space, Concierge, creator plans) against targets.

Default (lead), owner may override: the sections and what each holds, below. All front end for now: data comes through `lib/admin-api.ts`
(an API-seam file: each function says the request it will make under `/v1/admin/...` and returns marked sample data from
`lib/admin-fixtures.ts`). The header shows "Sample data" while the seam is not connected. Class prefix `fo-`, stylesheet `styles/admin.css`,
routes under `app/admin/**`, components under `components/admin/**`. The app's own look (styles/app.css tokens: ground, ink, line, Bebas
Neue titles, Inter text, copper accent), light and dark; calm and dense enough for work; staff use laptops, the owner checks on a phone:
it must work at 360 and 390 wide with no sideways page scroll (tables scroll inside their own box or become cards).

## Bundles
- ADM-A (first; the others stand on it): the shell (`app/admin/layout.tsx`: side nav on desktop, a drawer on a phone, who is signed in and
  their role, sample-data marker), staff sign-in (`/admin/sign-in`: a code to a staff email, through the seam), shared parts in
  `components/admin/ui.tsx` (table with sort and its own scroll, filter chips and a search field, status pill, stat tile, side drawer,
  confirm sheet that asks for a reason, timeline, loading/empty/error states, pager), the seam and fixtures with their types, and three
  sections: **Overview** `/admin` (today: sealed, opened, paid, takings by line; what needs someone: queue sizes that link to their queue;
  failed payments and messages), **Wishes** `/admin/wishes` and `/admin/wishes/[id]` (find by number, link, phone or name; a wish's life as
  a timeline: draft, sealed, live, resting, erased; its ticket, extras, payments, messages sent; actions: take down, restore, extend the
  term as goodwill, resend the link, start a refund), **People** `/admin/people` and `/admin/people/[id]` (accounts and their sides, Pass,
  wishes, payments; actions: ban, lift a ban, erase on request).
- ADM-B: **Moderation** `/admin/moderation` (three queues: reports, photos flagged by screening, takedown requests; each item: what, who,
  the wish, decide with a reason, the 24-hour clock), **Now Showing** `/admin/showing` (publish requests: screened then a person; listed
  wishes; wish of the day), **Styles** `/admin/styles` (all styles with level, kinds, use and preview-to-paid rate; move a style between
  Starter, Standard and Premium with a reason; switch one off) and `/admin/styles/review` (creators' submissions: preview, the automatic
  checks, rights confirmed; approve and place, or send back with notes), **Creators** `/admin/creators` (plan, credits, styles, earnings,
  the monthly payout run: who is past the threshold, mark paid).
- ADM-C: **Payments** `/admin/payments` (every payment: what for, Paystack reference, state; refunds with a reason; the ledger against
  the provider, with any difference shown), **Businesses** `/admin/businesses` (plan, wishes used and rolled over, Vault space used and
  billed, logins, invoices), **Concierge** `/admin/concierge` (orders: single or a list; assign a maker; names and dates; deliveries due;
  the opened report), **Prices** `/admin/prices` (tickets, extras, keeps, the Pass, Pro plans, Vault space, the date the 40% off ends;
  a change needs a reason and shows in the audit log; numbers shown come from lib/catalog.ts and lib/pro-data.ts, never retyped).
- ADM-D: **Support** `/admin/support` (inbox of WhatsApp and email threads tied to a wish or a person; reply; saved replies),
  **Messages** `/admin/messages` (the messages Firstwish sends: wording per message, and a delivery log with failures),
  **Numbers** `/admin/numbers` (the eight earning lines against targets, preview to paid, opens, by kind, occasion and style, keeps),
  **Team** `/admin/team` (staff and roles: owner, ops, moderator, reviewer, support, finance, maker; what each role may open),
  **Audit** `/admin/audit` (who did what, when, why), **Settings** `/admin/settings` (which providers are connected: payments, messages,
  email, AI, storage with its two choices Cloudflare R2 and DigitalOcean Spaces; switches).

## Current state
- ADM-A: screen built (front end only, sample data), web branch `adm-a`. ADM-B, ADM-C, ADM-D: can start; build on the parts below.
- Shell: app/admin/layout.tsx + components/admin/Shell.tsx (side nav at 960px+, drawer below; who and role at the nav foot; light/dark;
  "Sample data" marker while lib/admin-api CONNECTED is false). Nav list: components/admin/nav.ts (18 sections, grouped).
- Not built sections open app/admin/[...rest] ("Not built yet"); a real route at the same address takes over by itself. Unknown -> 404.
- Shared parts: components/admin/ui.tsx: Head, Block, Pill, Stat, Search, Chips, Table (sort, paging, own scroll on a laptop, cards
  under 760px), Pager, Drawer, Confirm (needs a reason of 4+ characters), Timeline, Loading, Problem, Nothing, Facts. Sheet/Empty/Toast
  are the app's own (components/app/ui.tsx), reused unchanged.
- Seam: lib/admin-api.ts (each function names its /v1/admin/... request; useAdmin() reloads after any action). Changes live in memory
  until a reload. Fixtures: lib/admin-fixtures.ts (SAMPLE, prices pulled from lib/catalog.ts and lib/pro-data.ts); types lib/admin-types.ts.
- Default (lead), owner may override: sample sign-in takes any email and any six digits and signs in as Owner; the session is kept in
  localStorage fo-staff. Phones and emails are masked (last four digits); phone search uses the last 3+ digits.
- Default (lead), owner may override: "Taken down" is its own wish state beside draft, sealed, live, resting, erased. Goodwill extension
  is 7 days. Resend goes on WhatsApp. Refund only marks the ticket payment "Refund started" (Payments, ADM-C, finishes it).
- Default (lead), owner may override: overview counts, takings by line and queue sizes are SAMPLE (PROVISIONAL) numbers.
- Default (lead), owner may override: staff sign-in reuses the app's AuthShell as is (its art and "Back to the site" link).
- Shared change wanted, not made: export useMode from components/app/Switcher.tsx; Shell.tsx has a copy of it (14 lines).
- Proof: tsc, check-css and a Playwright walk (360/390/1440, light and dark, the four cases, no sideways scroll, zero console errors;
  /app, /app/pro, /app/creator/studio same layout after /admin). Pictures: scratchpad build/verify/adm-a/.
- ADM-C: screen built (front end only, sample data), web branch `adm-c` (5b5cdab). Payments `/admin/payments` (list, find by
  reference / wish number / phone's last digits, drawer per payment via ?ref=, refund; Ledger view ?view=ledger), Businesses
  `/admin/businesses` + `/[id]`, Concierge `/admin/concierge` + `/[id]`, Prices `/admin/prices`. Seam lib/admin/c-api.ts (types
  lib/admin/c-types.ts, re-exported from lib/admin-types; fixtures lib/admin/c-fixtures.ts); lib/admin-api.ts gains only `cSeam`
  (ADM-C block). Confirm (components/admin/ui.tsx) gained an optional `ready` prop.
- Default (lead), owner may override (ADM-C): a refund is always the full amount; Refund on a paid payment, or "Send the refund" on
  one started from a wish, marks it Refunded (the server will wait for Paystack's confirmation). The ledger counts every payment
  taken that day (refunded or not) against Paystack's settlement for that day; Paystack's side and its three differences are SAMPLE.
- Default (lead), owner may override (ADM-C): businesses, logins, invoices, Vault use, Concierge orders, makers, names and dates are
  SAMPLE (PROVISIONAL); plan sizes, Vault blocks and prices come from lib/pro-data. A Concierge list's amount is a sample quote (the
  one-wish price per name). "This week" is the 7 days from the sample day (15 Nov 2026). Businesses has no actions yet (none asked).
- Default (lead), owner may override (ADM-C): Prices edits the price charged now (the list price is shown, not edited); extras show
  their 40% off price beside, keeps and Vault space are never discounted. The 40% off end date is not a constant anywhere in code
  (only "until 31 January" in copy): shown as 31 Jan 2027. PREMIUM_PRICE (lib/studio) is not listed again: it is the "A premium
  style" extra. A price change does not yet reach the site's own pages (they read lib/catalog until the server holds prices).
- Proof (ADM-C): tsc, check-css, Playwright walk (360/390/1440, light and dark, four cases, no sideways scroll, zero console errors;
  /app and /app/pro same layout after /admin by client-side moves). Pictures: scratchpad build/verify/adm-c/.
