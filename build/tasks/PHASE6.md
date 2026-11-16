# Phase 6: wire the 89 screens to the API (plan cut 16 Nov; not started)

Owner's words: "Nothing should be stored on the browser." (R10) "App and web please" (R5). Rules of the skill (contract-driven
backend, Phase 6): one agent per bundle of screens that share a data file; a separate verifier per bundle; a part of a screen
whose backing is not built is not drawn; done = the real screen showing a datum seeded on the server, with loading, empty and
error states working, and nothing left in browser storage. Load the skills frontend-surface-build and verification-harness
before the first spawn. Every agent on Sonnet (R17). At most 3 heavy agents while browsers run (a browser is heavy).

Inputs: .pipeline/scan-map.json (89 screens: admin 23, maker 22, website 15, pro 11, app 8, creator 5, auth 3, receiver 2;
by data source: local store 30, mixed 18, static 16, inline 13, direct 6, admin seam 6), .pipeline/ui-align-tasks.json (986
open: supersede 517, stub 226, designed-state 195, populate-path 48: folded into each bundle by screen id, never one agent
per task), .pipeline/stubs.json (228), rulings W1 (same origin through a Next rewrite /v1 -> API_ORIGIN), NN2 (the opening
gesture calls POST /v1/w/:slug/opens), ZB3 (the sheet and the date approval open the maker on the new wish; `madeOwn` needs a
writer or is cut), X18 (admin Prices keys), HA1 (keep and wake take the link in headers), GC1 (dictation gives text).

| id | tier | what | screens | stands on |
|---|---|---|---|---|
| W0a | T1 | The web repo's gates and live harness: no browser storage (R10: localStorage, sessionStorage, IndexedDB, document.cookie writes fail the build), no fixture or sample import on a live path, no dead control; Playwright against a real API stack; CI for the web repo | none | - |
| W0b | T2 | The shared API client and the session: same-origin /v1, access token in memory, httpOnly refresh cookie, error envelope, kobo formatting, contract types from the API (a check that they match); sign-in, sign-up, welcome | sign-in sign-up welcome | W0a |
| W0c | T1 | The owner's rules the live site breaks today (found by the new gates): native browser controls in 25 places, "sideways", an emoji, three controls that do nothing, the home page 21 px too wide at 360. One family of the app's own controls. Deployed when checked | pro, maker, auth, life, lab files | W0a |
| W1 | T1 | Website, prices and reads: the price book, kinds, pricing, business pages | site-home site-make site-wishes site-wishes-kind site-business site-business-cat site-pricing site-how site-creators | W0b |
| W2 | T1 | Website, catalogue and contact: styles, style page, Now Showing, contact (a support thread), privacy, terms | site-styles site-style-detail site-showing site-contact site-privacy site-terms | W0b |
| W3 | T2 | App, the person's side: home (feed), wishes, wish detail (share, keep, wake, video, publish), dates, you, Pass | app-home app-wishes app-wish-detail app-dates app-you app-pass app-styles app-style-detail | W0b |
| W4 | T2 | Maker 1: the draft from its first screen (name to more) saved on the server | maker-name maker-kind maker-occasion maker-partner maker-wedding maker-studio maker-call maker-more | W0b |
| W5 | T2 | Maker 2: content (cover, photos with uploads, chapters, ask and voices, opening, ending, style) with the AI writing and the reference reads | maker-cover maker-photos maker-chapters maker-ask maker-ask-voices-gather maker-opening maker-opening-scene maker-ending maker-ending-scene maker-style | W4 |
| W6 | T2 | Maker 3: watch, when, ticket (pay, Pass, plan), sealed | maker-watch maker-when maker-ticket maker-sealed | W5 |
| W7 | T2 | Receiver: the wish at its link (open, passcode, reactions, keep and wake by link), the showcase page | receiver-wish-mine receiver-wish-showcase | W0b |
| W8 | T2 | Business 1: home, client wishes, people and dates, brand, plan and invoices, logins | pro-home pro-wishes pro-wish-detail pro-people pro-brand pro-plan | W0b |
| W9 | T2 | Business 2: Vault, shoots, reveals, favourites | pro-favourites pro-vault pro-vault-shoot pro-reveal-new pro-vault-shoot-reveal | W8 |
| W10 | T2 | Creator and Studio: profile, published, Studio home, new, editor (drafts on the server, AI, submit) | creator-profile creator-published studio-home studio-new studio-editor | W0b |
| W11 | T2 | Staff 1: sign-in, overview, numbers, audit, team, settings | admin-sign-in admin-overview admin-numbers admin-audit admin-team admin-settings | W0b |
| W12 | T2 | Staff 2: payments, prices, businesses, creators | admin-payments admin-prices admin-businesses admin-businesses-detail admin-creators | W11 |
| W13 | T2 | Staff 3: wishes, people, moderation, Now Showing | admin-wishes admin-wishes-detail admin-people admin-people-detail admin-moderation admin-showing | W11 |
| W14 | T2 | Staff 4: styles and review, support, messages, Concierge | admin-styles admin-styles-review admin-support admin-support-detail admin-messages admin-concierge | W11 |
| W15 | T1 | The style and moment engine and app/lab: copy and control rules, deferrals, four forked names, hardcoded signals; the gates' baseline ends empty | none (engine files) | W1-W14 |

Order: W0a, then W0b; then three at a time, money and identity first (W3, W4, W11; W5, W7, W8; W6, W9, W12; W10, W13, W14;
W1, W2). Each bundle: build -> a separate verifier drives the real screens in a browser against a real API stack -> patch ->
re-check -> merge -> deploy only verified work. Exit: every ui-align task done or deferred by the owner; every stub resolved;
the R10 gate green; no fixture on a live path; then Phase 7 (API smoke) and Phase 8 (the live gate with real providers).

## Deploys during Phase 6
The live site has no API behind it yet (hosting waits for the owner's DigitalOcean access), so a wired screen cannot work
there. W0c (rule fixes, no wiring) is deployed when checked. After it, wiring merges to the work branch and is NOT deployed
until the API is hosted (Phase 8). A fix the live site needs meanwhile branches from the last deployed commit.

## Current state
16 Nov: W0a in (the web gates, a baseline of 526 findings each with its bundle, the live driver: wired 0 of 89, web CI). W0c running. Then W0b, then the screen bundles.
