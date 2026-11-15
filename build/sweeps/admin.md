# Sweep list: admin dashboard (lows)
- D: the shell shows "Ops Lead / Owner" while Team lists Owner and Ops as separate people (sample naming).
- D: a one-character reason leaves Send disabled with no hint why (say "A few words on why" under the field).
- C: lib/admin/c-fixtures.ts:17 retypes ₦6,000 (`num("₦6,000")`) in the sample provider-only line: read the Keepsake price.
- C: lib/admin/c-api.ts:192 retypes the 40% off end date (OFFER_ENDS "2027-01-31"): one constant for it (the server's price book owns it after wiring).
- B: components/admin/b/Creators.tsx:21 retypes "40% off" in copy: read the figure from where the app keeps it (lib/maker).
- B: taking a wish down (moderation or the wish page) must also unlist it from Now Showing (0004 still read "Listed" after takedown).
- B: lib/admin/b-api.ts:248 PAYOUT_THRESHOLD 5000 retyped: one constant shared with Prices (task J3).
