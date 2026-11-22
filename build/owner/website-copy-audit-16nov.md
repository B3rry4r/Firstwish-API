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
