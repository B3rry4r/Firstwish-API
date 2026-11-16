# API: what is still open (16 Nov 2026, after the leftovers bundle INT-7). Closed lines are in api-closed.md.

## For the next API base (a registry or shared change)
- A refresh with no cookie answers a distinct error code, so the web can show the server's words for an ended session
  without showing them to a first-time visitor (build/sweeps/web.md, W0b F3).
- standins.ts:96 (the stand-in mail file, test stacks only): the file is mode 0644 and holds sign-in codes: make it 0600;
  a bad path (a directory) makes each send throw while the code request still answers "sent": check the path at boot.
- Pack fallback (TT5 path, draws with no record: none exist, nothing is live): at most one paid place can be lost on a
  refund when an unrecorded draw was really the refunded pack's. Accepted.

## Not run against the real provider
- B08 and INT-7: the Paystack refund lookup by amount, the refund, the payout and the settlement calls (stand-ins and a local
  server only).

## Cannot be given back
- Draft client wishes removed before 16 Nov's change have no window job, so they give nothing back (there are none: nothing
  is live).
