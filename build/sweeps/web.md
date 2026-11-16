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
