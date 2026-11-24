# Web: small things left for a sweep or a named bundle (16 Nov 2026)
- HK2: light choosers see dark for ~0.4 s on a reload of a signed-in screen (owner asked; a server-set cookie would cure it).
- W0b low: lib/account.ts:103 uid() uses Math.random (W3 shrinks this file).
- W0b low: Welcome 3 of 3 at 360: the date picker opens upward over the heading (inside the screen; nothing is cut).
- W0b note: "empty" ui-align rows UA-647, UA-651, UA-710 have no meaning on sign-in, sign-up, welcome (marked not-a-state).
- W8: the placeholder "Choose a d..." truncates in half-width date fields. W5/W10: tab reach of the inert preview scenes.
- All: field rest border contrast 1.7-2.2:1 (one token; a design-system change, not a screen's).
- W0b low (F3 undone on the lead's diff read): after an erased account's reload in a tab that was not signed in, the sign-up
  screen shows no words. The server answers a refresh with no cookie and a refresh of an ended session with the same 401
  words, so the page cannot tell a new visitor from an ended session. Cure with an API base: a refresh with no cookie
  answers a distinct error code (no words shown for it); then the page shows the server's words for every other refusal.
- W3 (merged 16 Nov): after a reload a heart or a save shows as not set (the server's feed row has no "mine": HP9,
  API-BASE-4); the payments module never writes a `reason`, so a failed payment shows the app's own words; wish cards
  show the mark until the owner's read gives photo urls (HP3); UA-758 (the style page's sample Preview) and three
  not-measured ids (UA-544, 545, 763) stay open; the 10 named casts in lib/person.ts go when API-BASE-4 fixes the contract.
- The live driver: scripts/live/flows/w11.mjs:69 deletes payments while purchase grants exist (FK error) once another
  flow has made payments; W11's "numbers empty" check fails when it does not run first. The driver's flows must each
  own their data (WEB-SHARED-1).
- W4: one uncaught "Event" console line at the wedding-day step, seen 3 times by different agents (W5 finds the cause).
- W13 (merged 16 Nov): the held photo is not drawn and days 1-6 of the wish of the day are not shown after a reload
  (API-BASE-4 gives both: WEB-API-4 draws them); lib/admin/w13-api.ts re-declares about 20 staff view types by hand
  (the contract's staff reads are row-shaped: API-BASE-5 or WEB-API-4); Mark paid, the payout run and bans send no
  Idempotency-Key; a creator's waiting amount can show negative ("-₦2,500": the server's figure); Mark paid stays drawn
  after a payout succeeded; the Mark-paid sheet's X touches its title at 390; a 404 wish or person shows "Try again";
  "Picked just now" names an unlisted wish until a reload. UA-3, UA-252, UA-316 stay open for the Studio bundle (W10).
- W12 (verify 16 Nov): lib/admin/c-types.ts and c-live.ts type the staff payment, refund, ledger and business reads by
  hand with `as unknown as` (the contract is loose there: an API contract fix, API-BASE-5, then the casts go); a price
  typed 0, negative or not a number gets the screen's own words and is never sent; finance sees no "Changes" block.
- W7 (verify 16 Nov), for other bundles: W6: components/app/maker/Seal.tsx:86 tells the maker to send /w/mine?id= as
  the receiver's link (a stranger meets "Sign in"): it must be the server's /w/<slug>. W8: components/app/pro/ui.tsx:114
  and W9: components/app/pro/vault.tsx:20 build /w/mine?name=&no= links that now land on Wishes. WEB-API-4: lib/api.ts's
  headers option must not let a caller overwrite Authorization or the Idempotency-Key. API-BASE-5: keep and wake by
  link (item 8) and house showcase wishes (item 9); then a small web bundle draws them. The receiver page is dark in
  light mode too (check against the design before changing).
- W7 (merged 16 Nov): a reload then "Yes" on the ring counts as a second person (the web sends a new visit id each
  load; ruling: send none and let the server's own link+address+browser hash decide: a small web change with
  WEB-API-4's follow-up); links to a style's wish still drawn from fixtures at components/site/ShowingGallery.tsx:77,140
  (W2) and components/admin/b/Review.tsx:48 (W14); the style scenes' voices chapters show text only.
- W8 (second check 16 Nov), accepted at the merge and owed: a team LOGIN cannot use the business screens (the app
  shell gates on the owner's side and shows "Add a business"; /me does not say who is a login: API-BASE-6 case 3, then
  the shell opens the pages for a login); two tabs can both pay for a plan (API-BASE-6 case 2 refuses the second);
  an import counts as added a row whose phone or birthday the server stored blank (API-BASE-6 case 7, then the
  screen shows the server's per-row answer); lib/site-plans.ts is a second copy of the plan prices drawn by the
  website's ProPlans (W1 reads the price book and deletes it); the "light" pictures of these screens look dark.
- W5 + W5b (checked 16 Nov; waits for WEB-API-4 to merge): scripts/live/drive.mjs calls the w5b flow with no pics
  folder and the flow dies at its first screenshot (fix at the merge: skip the picture when pics is null); the 7th
  photo's tile shows the server's short message, not its exact field text; /w/mine's empty line says "Write a
  letter" for kinds that offer no letter (group, wedding, teams); a wedding save-the-date has no note chapter.
- WEB-API-4 (checked 16 Nov, patch running): the maker threw an uncaught "Event" on every /app/new screen when the
  web-font host cannot be reached; WishCard does not retry a failed picture; Ban sends no Idempotency-Key.
- THE MERGE CHAIN (lead): WEB-API-4 first (it changes scripts/live: plantCode is gone); then a merge agent takes
  w8-business1, w5-maker2 and w1-site1 in turn: merge the web head in, move each flow to codeFor(), run the checks
  and the whole driver, hand back; the lead merges each.
- W1 (second check 16 Nov, lows): the Bebas Neue licence text (SIL OFL) is not beside the two woff2 files in
  public/fonts; first paint follows the device's light or dark (the base was always dark; R10's mode change).
- W2 and W14 (from API-BASE-6): "Watch it play" and every link to a style's wish use the style read's showcaseSlug
  (/w/<slug>), never a fixture (components/site/ShowingGallery.tsx:77,140; components/admin/b/Review.tsx:48).
- W10 (builder, 16 Nov): lib/account.ts fromMe keeps the switcher's creator side after Close (`me.creator ||
  base.creator`: use `me.creator`; WEB-API-6B's file); UA-345, UA-346, UA-347 (a promotion's end date) and UA-922
  (base look read on the server) stay open; the app frame stays dark under light mode (check against the base).
- W10 (check 16 Nov): FIX FIRST: an uploaded Studio picture is blank after a reload (no server read yet): P-W10 stops
  drawing Studio uploads until API-BASE-7; then a web bundle WEB-API-7 draws Studio files (pictures, poster, sound,
  model, profile picture), Signed off / move to Open, the payout threshold from the book, `publish` on the list.
  The Studio design draws no speak control (R13 is the maker's letter): not a finding. Not run by the checker: a
  reversed credit payment, a failed AI ask giving the credit back, a placed picture after a reload.
- WEB-API-4 (second check 16 Nov, lows for W15): the web-font stylesheet link is in the document twice on /app/new
  and the Studio screens (app/layout.tsx and the screen each render it; same URL, fetched once): one link, from the
  layout; w11's "numbers empty" check is conditional; Ban's double tap and the Audit "Removed" group were read in
  code, not driven; the cascade comparison against the pre-merge head was not possible.
- The lead's driver run on the merged web head c3c29e6 against API 4095042 (16 Nov, built web, twice): 559 of 560
  both times; the one FAIL is W7's resting check (the API now answers 200 "resting", HS2): WEB-API-6A redraws the
  resting state and moves the check. What the receiver's page shows for a resting wish today is NOT known.
- W8 MERGED (16 Nov, web 7742f24 + records 0ab4c23): owed on the Plan screen after API-BASE-8 (WEB-API-6B): when a
  login's payment is pending the owner sees until when, can read its result, and can drop it ("Start again", HY1).
  UA-235 and UA-829 (a saved logo seen end to end) stay open for WEB-API-6B's logo case. Light mode was measured for
  the pending state only.
- W14 MERGED (17 Nov, web ae8fa41 + records 790425d). Owed after API-BASE-8, as one small staff bundle (W14B):
  "Find a thread" and "Find an order" come back (the designed screens had them); "Hand to someone" for a support
  member; Concierge's "Payments and refunds" opens THAT order's payment (today a bare link: staff pick by hand).
  Not owed (the designed screens never drew them): refuse a submission, a Concierge quote, saved-reply add or edit.
  Lows: Support draws its filter chips above the refusal for a reviewer; the Styles search placeholder is cut at
  360; .pipeline-ui/scan-map-screens.json:1025-1035 lists deleted lib files; /admin/wishes at 390 scrolls sideways
  (scrollWidth 399: a screen wired earlier (W13): a small patch).
  Not run by the checker: an edited receipt template sent by a real settled payment.
- P-W9 (17 Nov): the web finds a left-behind reveal wish by client, occasion and day (the server takes no key on
  client-wish create): closed for good when the Vault uses the server's one-call reveal (E-272, the ninth API
  round): a web bundle WEB-API-9 after it merges (one-call reveal, favourites, downloads, rename, pick files, plays).
  The driver's w12 flow crashes on a SECOND run on a used database (invoice_link key): second-run state in w12.
- W2 (22 Nov): export readPages from lib/site-book.ts (lib/site-styles.ts holds a copy); cover images are 10-minute signed urls (a kept stale page loses covers); catalogue loading/error/retry states not measured; not done UA-661 679 683 684 688 896 901 908 (reasons in the bundle's ui-align file).
- W2 check (22 Nov) lows: components/site/StyleCatalog.tsx:5 the kind filter's list of kinds comes from the bundled lib/catalog (what is on comes from the server); terms and privacy replace their legal paragraphs with "This part could not be loaded" when the price book is unreadable and no copy is kept; /showing logs one console error when its quiet refetch gets a 500 (API down); two tabs sending the same contact words make 2 threads (API-BASE-11: Idempotency-Key).
- WEB-API-6A check (22 Nov): MEDIUM accepted with this row: the owner cannot turn a gather link back on (no endpoint: API-BASE-11, then the step's "Turn it on"). Lows: the gather step's "Written / Not yet" summary and draft resume ignore friends' voices (lib/maker.ts:333, components/app/maker/Maker.tsx:482); components/wish/Showcase.tsx:127 set-state-in-effect lint warning; /g/<slug> and /w/<slug> ignore light mode (the "light" pictures are dark: owner to say if the receiver's pages follow the theme); UA-551 is done in effect (mark it); OFF=0.4 still hardcoded at lib/maker.ts:376 (UA-323, the maker pay bundle or W15).
- Vault re-check (22 Nov) lows: after A sent, B sent, then A again, the reveal form says a different client "takes one wish" though the server reuses A's wish and takes none (app/app/pro/reveal/new/page.tsx #fp-again-note); a send with the pack empty was not driven; the Vault screens were measured by the flow only. OPEN QUESTION for the lead's run on the tenth-round API: "W12 the owner's payout change clears PROVISIONAL" failed once (looked for ₦7,078): the tenth round adds a second PROVISIONAL setting (conciergeFilesDays) to Prices.
- Maker pay (22 Nov): "W13 moderation: the held photo HP12" failed in two verifiers' whole-driver runs under load and passes alone: if it fails in the lead's whole run it gets its own small task. A real card return was never driven (stand-in only): Phase 8.
- From WEB-API-6B (22 Nov): the Vault screens and lib/vault-api.ts should send x-business-id (WEB-API-9). "W13 moderation: the held photo in the queue" has now failed under load in FOUR whole-driver runs and passes alone every time: the flow must wait on the queue's state, not a fixed time (a T0 flow-only task, with W15B).
- From P-W12B (22 Nov), for WEB-API-7 case 8: components/admin/c/Prices.tsx draws the limit lines (days, bytes, hours) with formatKobo ("31 days" reads "₦0.31") and its Change sends priceKobo where the API's changeLimit takes only `value`: a change from the screen is refused. HIGH for staff: must be in WEB-API-7.
- From API-BASE-12 (22 Nov): uploads take an optional fileName; the web sends the picked file's name so the live stack's screening stand-in (STANDIN_SCREENING=hold:<text>,reject:<text>) can drive the held and refused states: add to WEB-API-7 (Studio files) and to the flows that upload.
- W15B check (22 Nov) lows: components/app/maker/StylePick.tsx:91-98 Continue stays active while the levels are loading or failed (seen, not clicked); the cover placeholder "BSc Architecture" and the "more" placeholder "Tobi|Ada" are sample people outside B8; the VAT line on an invoice detail was not measured; UA-679, UA-688 (privacy and terms "could not be loaded") cannot be entered (the kept copy serves): leave or rule not applicable; UA-725 (the video render) and UA-808 (the passcode hash) need a paid sealed wish on a stack: a later verifier.
- WEB-API-9B check (22 Nov) lows: after an API outage /creators regenerated without its "four moments" and stayed so for 130 s after recovery; scripts/live/flows/p-w5.mjs:246-247 reads the moment list right after #fm-title without waiting for the levels read ("Getting the scenes…"): a flow race since W15B (T0 flow fix, with w5-maker2 "styles on screen").
- WEB-API-9A re-check (22 Nov) lows: held hearts were NOT driven in a browser for the film (screening), stage (gallery) and stories (status) styles, nor a Studio-made style (typechecked only): the next checker of the reveal drives one of each; light and dark not measured apart for the hearts case; the builder's branch carried .next-wa9a lines in tsconfig.json (the lead kept the head's file at the merge: builders must not commit tsconfig.json after a built stack); the video extra offered on an opened wish (P-FLOW-1 item 5).
- P-FLOW-1 check (23 Nov) lows: components/app/AppShell.tsx:61-63 "Getting your account." flashes for 40-60 ms on every fast load (no layout shift): show it only after a short wait; the You screen's loading block sits at an 80 px inset and its error block at 30 px with the eyebrow touching the top at 360; the video sheet of a wish whose video was asked still offers "Send me the video" beside "being made"; the creator's own `studio:` style in the maker's Continue was read in code, not run; pw3 "after a reload the person still follows" depends on Home's capped who-list (fails on a stack with many creators): the flow should look the creator up, not rely on the first few. WA6B "the first business opens: its name" failed in three whole runs and passes alone: a flow that reads early under load.
- WEB-API-7 re-check (23 Nov): the Studio home's loading is a skeleton with no words; background, fill, poster and 3D model placements were not hand-driven against the real server (wa7 covers a sound).
- W14B check (23 Nov): MEDIUM components/admin/b/Styles.tsx:87 a 300-character unbroken search word makes /admin/styles scroll sideways (the same fault W14B fixed on Wishes, Support, Concierge); lows: Support.tsx:42 and Concierge.tsx:47 placeholders cut at 360; Support.tsx:30 and Concierge.tsx:37 the word and chips are lost on Back from a thread; Concierge.tsx:106 a FAILED read of the order's wishes says "No wish is tied to this order yet."; lib/admin/w14-api.ts searchWord cuts the word to 100 for the server but the screen echoes all of it; two staff handing one thread at once: last wins, the other screen says nothing until a reload. (P-W14C)
- P-W14C check (23 Nov) lows: at 360 the Table's header sort control could not be clicked by the probe (the card layout covers it): check a person can sort on a phone, on the base too; paging was not clicked through on any list; w11.mjs "numbers with data in the stack does not claim an empty period" fails ALONE on a fresh stack (it needs data other flows make: the flow should make its own).
- P-FLOW-3 (23 Nov): on a style page with public wishes at 360 and 390 an `a.poster` overflowed by 16 px in one run of three (components/site/StylePoster.tsx, app/styles/[slug]/page.tsx:76): depends on the data; measure with long titles. The maker's Continue stayed off when the server had picked an apology-only style for a birthday wish: the server's rule is being fixed (API-BASE-17); the harness works around it until then (makeDraft sends "noir": take that out after the round merges).
- API-BASE-17 check (23 Nov) note for the web: lib/offers.ts:66 startStyle ignores kind borrowing for planners and vendors (125 kind-by-occasion cells where the web's list is shorter than the server's): the web's list of styles should be the server's (allowedStyles and the public list), with no second rule in the web.
- WEB-10A check (23 Nov) lows not in the fix round: w5b "4a a voice note plays after a reload" fails on the base too (media=0): pre-existing, owed its own look; a Concierge order and a real business-space account's maker were not reached by the verifier; case 7 (an old draft with a code inside content) was only seen through the builder's check; WRAP const repeated in seven staff list files (one shared export).
- WEB-10A re-check (23 Nov) low left open: in-app Back then Forward to a later maker step does not re-check the secret (only when it was cleared outside this tab); it stops before pay, and a visit by address is gated. For WEB-10B: the ticket screen should send a seal's 422 about the secret back to the opening step (Ticket.tsx:288 shows the words, with no way back).
- W16 check (23 Nov) lows: F1 lib/offers.ts:66-80 the `moving` branch is still a second copy of the kind/occasion/level rule, with no kind borrowing (a move into planners or vendors sends no style and the server refuses in words: 28 of 204 cells; the maker cannot draw those kinds today): closes when the SERVER picks a style on a kind or occasion move (an API row). F2 w11.mjs ~172: the "empty words" check runs only when the screen already shows them (an empty stack showing invented figures would pass unseen): give it a stack with no ledger rows. F3 Showing, Businesses, Payments and Numbers had no rows: their phone "Sort by" row was not measured. F4 Styles, Creators, People, Wishes, Messages keep the sort out of the address (as on the base). w7 3 FAIL and wa6a 1 FAIL are on the BASE too: P-FLOW-4.
- WEB-10B check (23 Nov): MERGE with M1 (medium) + L1-L4, all OWNED by task WEB-10C (after server round 20 puts what a wish holds on the wish read): M1 page.tsx:84,:33 the page learns "bought" only from GET /payments and swallows that read's failure (a paid extra is hidden until a reload; nothing is charged, the price never shows); L1 after a refund is sent a reload offers "Send me the video" (the server refuses with words); L2 Ask and Ask again send one POST a click (the server keeps one job); L3 Ticket.tsx:161,:205 a refused Keepsake with a premium style stays checked with Pay off and no button to the style step; L4 a business on a plan still makes two ticket-offers reads; after Enter on "Take it as a video" the first Tab lands behind the sheet (pre-existing). NOT RUN by anyone: a real "not sold" or 503 (the stack cannot switch the renderer off: replayed), the 120-read cap, a Signature ticket in the maker.
- P-FLOW-5 (23 Nov): the w5b voice-note check failed because the flow tapped a button named exactly "Open" and the style the server now picks says "Open it" (a FLOW fault; fixed, one line). NOT checked by anyone: that the voice note is HEARD after a reload (the audio element's currentTime moving, no error state): the check proves the button is offered and the stored file is read. Flows that name a button by its exact words break when a style words its opening differently: a kit helper "pass the opening" would stop this kind.
- WEB-10C check (23 Nov): MERGE; M1 (the shared Sheet has no focus trap) and L1 (readBook's one page), L2 (a pay sheet for a shut ticket after the recheck), L3, L4 are OWNED by task W17. Left: RefundDue still reads GET /payments on the wish page (7 reads over 8 views: for its own purpose; trace and trim); a ticket shut for PHOTOS cannot be reached (the server caps a ticketless draft at Moment's 6 photos and its offers never shut a ticket for photos: only the web's planFor does: a web-only rule to remove or move to the server); NOT RUN by anyone: a real renderer-off or 503; the planner and vendor kinds in the maker (no style is on for them).
- W17 check (24 Nov): MERGE, lows: L1 components/app/ui.tsx:28-40 focus returns to the last control outside any dialog, so a sheet opened INSIDE the staff Drawer (Payments.tsx:174) sends focus behind the open drawer on Escape (the Drawer is not in the stack); L2 after Pay the focus drops to body on the waiting panel (life/PayStart.tsx; as on the base); L3 scripts/live/kit.mjs:14-20 passOpening knows Watch, Open it, Open only ("Unwrap", "Lift the flap" return false) and w7, wa7c, wa6a ignore its return; L4 the heading "That style is not on right now." sits over words that say the style is not made for that kind. Not run: creator and business sheets; a sheet taller than the screen.
- R5 hand-back (24 Nov): scripts/lib/stepped-clock.mjs swallows an error thrown inside a timer callback (it rethrows into a new timer), so it never reaches pageerror and the recorder cannot see it: the shim should set window.__render.error (the R5 check, attack 6, proves or clears it).
