# W1 copy audit (branch w1-site1 930d175 against f3cb452)
Truth ids are in /home/user/Firstwish-API/.pipeline/product-truths.json. Verdicts: RESTORE / KEEP REMOVED / OWNER.

| Before | After | Page | What backs the BEFORE | Verdict |
|---|---|---|---|---|
| Proof: three quotes (Dayo, Ngozi, Emeka) | removed ("Facts about every wish.") | home (cinema/Proof) | nothing found; no review or quote store in the API | KEEP REMOVED (made up; owner may supply real ones) |
| "1 min" Running time, from voice note to finished wish | removed | home | nothing found; no job measures it | KEEP REMOVED |
| BUT "About a minute" still stands: "Three acts. About a minute." (home How.tsx:9, how/page.tsx:14 meta, :21, :59) | unchanged | home, how | nothing found | OWNER (same unbacked claim the builder removed elsewhere; gate missed it) |
| Soon cards: Churches & communities, Schools & alumni | removed (page, Nav dd-soon and mm-soon, footer) and `soon` list | business, Nav, footer | nothing found; R8 bans "coming soon" | KEEP REMOVED |
| "Most popular" pop on Keepsake | "40% off" tag (only when a was price exists) | pricing, home | nothing found; no sales ranking served | KEEP REMOVED |
| Concierge: "A single wish is ₦15,000, delivered within three hours" / "then ₦25,000, delivered within 3 hours" | price only, "VAT included" | make, pricing, home, business, FAQ | T-13; API concierge/order-state.ts SINGLE_WISH_HOURS=3 sets dueAt. Price book field conciergeDeliveryHours is 0 | RESTORE (product and API back 3 hours) |
| FAQ delete: "Ask us to erase it now and it is gone for good within 24 hours" | removed | pricing | T-50; erase-now job in wishes/wish-lifecycle.service.ts. Price book lifecycle eraseWithin is null | RESTORE |
| "three months ahead by transfer" (Pro plans lead) | removed | business, pricing | T-38 (product-plan L158) | RESTORE (owner's promise, product backs it) |
| "Join before then and keep that price 12 months" | removed | business, pricing | T-38 | RESTORE |
| "Add a wish to a package for ₦8,000 to ₦12,000 and keep the difference" (and catalog note ₦7,000 to ₦12,000) | "at your own price" | business, business kind | no line backs the range (two different ranges in the files); not in price book | KEEP REMOVED (hand-typed price; owner may supply) |
| "Both included on Signature" (QR card / WhatsApp message) | removed | how | T-04: QR card is on Signature; a "ready message to forward" has no route (R11) | RESTORE for the QR card; the message part OWNER |
| "On Keepsake and above, they can send a reaction straight to you" | "They can send a reaction straight to you" | how | T-03 says reaction is Keepsake; the API has no tier gate on reactions | OWNER (product says Keepsake, API ungated) |
| "A message the second it opens" | "An email the second it opens" | how | R11, email only | KEEP (change is right) |
| Ticket list lines: Moment "The midnight seal"; Keepsake "Voice note or song link", "Know when it's opened", "They can send a reaction" | gone from the ticket cards (cards are now built from the server entitlements) | pricing, home | T-03 (all three), T-72 | RESTORE (owner's words dropped, a Keepsake card now lacks what T-03 lists) |
| "A wish holds 20 photos at most" bullet; "Keepsake takes up to ₦7,500 of extras..." bullet; extras table (prices, Yes/No per ticket) | rows reduced to "Become the next ticket"; ceiling and 20-photo lines not on the page | pricing | T-09, T-30, T-33 | RESTORE (price book maxPhotos is null so nothing feeds it; ceiling is in lifecycle only if set) |
| Creators: "Twenty percent, every time your style sells" | "You earn each time your style sells" plus a big 20% | creators | T-65 | KEEP (wording ok) |
| Creators: ₦800 each paid wish, ₦80,000 from a hundred wishes | still shown, now computed from LIST price (20% of ₦4,000) | creators | T-65: ₦800 at list, ₦480 while 40% off runs; API royalties.service.ts ZZ4 pays 20% of the price in force (₦2,400 now, so ₦480) | FIX: figures are wrong until 31 January (₦480 and ₦48,000); contradicted by the API |
| "Seven to choose from" styles | "<server count> to choose from" | how | styles read | KEEP |
| "Six kinds of wish" and counts 7/13 occasions per card | server-open kinds, word count | home, make, wishes, Nav, footer | styles read | KEEP |
| FAQ: "kept in your account for twelve months", "wake it for a month, six months or a year", "bring it back for 30 days" | now from lifecycle fields, dropped when the field is null | pricing | T-49, T-48, T-50 | fine while fields are served (they are, restingHoldMonths 12, restoreWindowDays 30) |
| Pricing title "40% off until 31 January." and meta with prices | live headline and live prices | pricing | price-book promotion | KEEP |
| Fallback headline "Pay only when it looks right." | new, typed in file when headline is empty | pricing, home | none | low: new words, owner may accept |
| Footer/Nav "All six kinds", "All 43 styles" | "All kinds", count from read | Nav, footer | styles read | KEEP |

## After the second check (16 Nov, evening)
The copy-only patch (w1-site1 ab56486) put back, word for word, every sentence the second check found changed
(plan cards, the Vault footnote, the pack card, business Act 01, pricing FAQ lines, ticket card lines, the creators
plan lines). Figures inside those sentences are read from the price book. The lead read the diff (53 lines, 6 files).
Rows for the OWNER (each stays as written until answered):
- pricing: "Prices shown are before the N% off ... Keeps stay at the price shown." The table now shows the offer price
  beside the struck list price, so the sentence reads wrong on the page. Default (lead) if not answered before the
  wired site is deployed: "N% off applies to extras until <day>, shown struck through. Keeps stay at the price shown."
- Pro plans: "Priority support" (nothing in the product gives Studio support ahead of Starter).
- Wish pack: "Use them whenever you like" (the pack's Vault space is for a set number of days: say if the wishes
  themselves never run out).
- Creator plan: "Premium styles as templates" (no part of Studio offers them yet).
- "Any wish, Shoot Reveal included", "A client dashboard", "For a business that wants to try it first": the product
  does these (reveals, the business pages, the pack); kept.
- The words "VAT included" the builder had added (Concierge line, the trust line) went back to your "VAT invoices".

## Privacy and terms against what the server does (22 Nov, from the catalogue build; no sentence was changed)
| Sentence on the page | What the server does today | Lead's default, owner may override |
|---|---|---|
| Privacy: a removed wish can be brought back "for 30 days, then it is erased" | A removed wish is never erased and can be brought back with no end date | Make the server do what the page says (erase at 30 days): on the API list |
| Privacy "comes down the moment ... asks"; Terms "we take it down at once and review it after" | A take-down ask opens a report; staff decide within 24 hours; the wish stays up meanwhile | OWNER: hide at once on every ask (anyone could hide anyone's wish for a day), or change the sentence to "within 24 hours"? |
| Privacy: "never use your photos or voice to train anything" | Letter words go to the AI provider; no code states a no-training rule | OWNER: this is a promise about the provider's terms; confirm when the Anthropic key is set up |
| Terms, Pro: "prepaid three months by transfer" | No such plan in the price book (the Wish pack is 90 days) | OWNER: drop the sentence or add the plan |

## For the owner: the 319 colours inside the style players (22 Nov)
The rule checker lists 319 "raw colour" findings, all inside the designed looks: the style players
(components/styles: stage, film, swipe, stories), the opening and ending moments, the motion kit, Studio's named
looks and the styles' posters. They are each style's own palette, by design; the site and app chrome already use the
shared colours. They sit on the accepted list with that reason. Three ways to finish, the owner picks:
 (a) say in the checker's settings that a style package is its own colour layer: the 319 leave the list, no code
     changes, the chrome stays checked. The lead tried to make this change itself and the session's safety check
     refused it (a change to the checker needs the owner's word): NOT done.
 (b) move every colour into one palette file per style and name those files as colour layers: a real change across
     43 styles with a picture-for-picture comparison; about three builder bundles; no visible change if done right.
 (c) leave them accepted as they are: the accepted list never reaches zero.

## For the owner (22 Nov, from the public reads bundle; not merged yet)
- The site's menus (top and footer) and the Home styles row: the builder had replaced the designed picks with the
  server's first seven styles in catalogue order (the flagship styles left the menus). CORRECTED before any merge
  (ruling IH5): the menus keep the designed picks and order (Studio Noir, Love Letter, Golden Hour, Cinema, Owambe,
  Constellation, Boarding Pass); the server only says which are on. When the owner says how a style becomes
  "featured" (a staff switch, a list in Prices, or the most used), that rule replaces the list and fills the
  "Featured styles" shelf.
- The canvas draws no public page for a creator, so none was built; the server can already serve one (a creator's
  listed wishes and approved styles). Say if you want that page.

## Asked on 22 Nov (late), still open
- The portrait video as an extra: the server sells an extra only until the wish opens, so a Keepsake that is already showing cannot buy the video (the page no longer offers it there; a ticket that includes the video, and a resting wish, still get it). Should a showing wish be able to buy it? (Today: no.)
- Defaults made by the lead on 22 Nov that the owner may override: II1 (an approved creator style's document is public where it is played; a draft never), II3 (a wish keeps the style version it was made in), II4 (a file an approved version uses is kept for its wishes after the creator deletes it), II5 and II5a (a style may use only its own files that passed checking; the shelf may hold one still being checked).
- (23 Nov) A refund rule the lead set as a default (IJ3): the premium-style extra cannot be refunded on its own while the wish still uses a premium style; after sealing the look stays the customer's and the extra stays paid. Say if staff should be able to refund it anyway.
- (23 Nov) Found and closed on the unreleased server: a cheaper ticket could be started and settled for a wish holding a higher-level style. No live system took money this way.
- (23 Nov, from the audit of old rule breaks: build/tasks/W15C-PLAN.md) Four more for the owner: (O1) may the style lab (/lab and /lab/motion: an unlinked internal page that plays sample wishes) be deleted? (O2) 34 accepted entries where the code is right and the rule gate cannot tell (17 animation state flags, 11 plain-English comments, 4 same-name classes in different styles, 2 path shapes): keep them accepted, or change the gate (a gate change is the owner's). (O3) which real reveal replaces the "Watch the sample" link that points at claude.ai. (O4) the style packages' own colours (248 by the audit's count): the earlier three options still stand.

## 23 Nov: three rows a checker found still open (nothing wired is released, so no real wish is affected)
- A passcode or question set in the maker never reached the server: the wish opened for anyone. Being fixed (web WEB-10A, server round 19). Default IK1: a wish that needs a secret cannot be sealed without one.
- The portrait video extra: the server has NO real video renderer yet. Default IK3: the extra is not sold until one exists. The real renderer is a task still to plan and build (a recording of the wish made on the server). Your call if you would rather drop the extra.
- Default IK2: a question's answer ignores capitals and outer spaces; a passcode is exact. IK4: a paid video is never offered again at a price. IK5: the Studio's save checks the base look and layout on the server.
- 23 Nov, later: Signature and Premiere include the video. Default IK3a: where no video can be made, nothing that includes the video is sold. So on the real server the top two tickets cannot be sold until the real video maker is built: it is a release blocker, and its task comes before the live check.
- Default IK2a: outer spaces are cut from a passcode and an answer (phones add them); a passcode keeps its capitals, an answer ignores them.
- The video maker's plan (build/tasks/RENDERER-PLAN.md): a helper on your DigitalOcean server opens each wish as a phone would and records it (1080 by 1920, silent, up to 30 seconds for status, up to 60 for a resting wish). It needs a server with 4 GB of memory; each video takes a few minutes. ONE QUESTION: the plan documents say the receiver of a resting wish is also offered the video file. Should they be, and how do they prove who they are? Until you say, only the sender gets it.
- Concierge: nothing limits how many unpaid order briefs one account can open; twenty taps make twenty unpaid orders (no money moves until one is paid). Say if you want a limit.
- 23 Nov, round 20's check: no extra a wish already holds can be charged for twice (tested for every extra and ticket). FOUND: the server does not count or time video clips: a Premiere wish took 8 clip uploads; only the website limits them. Server round 21 will enforce it (three clips of up to 15 seconds on Premiere; one more with the extra; one long clip of up to 60 seconds with its extra). Default IL1a: each clip extra is held once. Also for you: five more photos can be bought again and again (each adds five; the test stopped at a payment ceiling on Keepsake after three and found no limit on Signature). Say if you want a limit.
- 23 Nov, round 21 (being checked): to read a video clip's length the real server needs one free tool installed, ffprobe (it comes with ffmpeg, which the video maker needs anyway). It goes on the server set-up list; nothing to buy.
