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
