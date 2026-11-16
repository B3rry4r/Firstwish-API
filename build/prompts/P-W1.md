PATCH P-W1 | TIER T1 | Budget 80 steps. Close the verifier's findings on the first website part; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules), /home/user/Firstwish-API/build/prompts/W1.md, rulings HV1-HV3 in
/home/user/Firstwish-API/build/rulings-phase3.md, and the verifier's files /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w1-site1/VERDICT.md and copy.md (the copy
audit: every row has a verdict).
Work: branch `w1-site1` (930d175) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w1 (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w1
w1-site1`; `npm ci`); API for your stack: a detached worktree at the commit in your spawn line, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w1-api;
ports 5520-5539; stack prefix pw1; a built web. Run every command with your own worktree as the working directory.
 F1 (high, HV1) The owner's words come back exactly as they were on the base (f3cb452: `git show f3cb452:<file>`)
    for every row of copy.md marked RESTORE: Concierge "within three hours" (each place); "gone for good within 24
    hours"; "three months ahead by transfer"; "keep that price 12 months"; the QR card on Signature; the Moment and
    Keepsake card lines (the midnight seal; voice note or song link; know when it's opened; they can send a
    reaction); the 20-photo line, the Keepsake extras-ceiling line and the extras table. Figures inside them come
    from the price book where it serves them; where the book's field is empty or 0 (conciergeDeliveryHours,
    eraseWithin, maxPhotos) keep the owner's number in the sentence with a comment "MECHANISM: <the API file that
    delivers it>" (copy.md names each) and list the field under REQUESTS for the API. Rows marked OWNER go back to
    the base's words too, untouched ("On Keepsake and above, they can send a reaction straight to you"; "Both
    included on Signature"): the owner decides those, not this patch. Rows marked KEEP REMOVED stay removed.
    "A message the second it opens" stays "An email the second it opens" (R11).
 F2 (high, HV2) creators: the share figures follow the price in force: with the offer running the page says what a
    creator earns per wish today (20% of the price paid) and, if it also shows the list figure, says which is which;
    the "from a hundred wishes" figure follows. Read both prices from the book; no typed figure.
 F3 (high, HV3) lib/site-book.ts: a failed read at refresh keeps the last good page (throw at refresh so Next keeps
    the stale copy; the "could not be loaded" state shows only when there is no good copy at all, as at a first
    build with the API down). Prove: build with the API up, stop the API, wait two refresh periods: prices still
    shown; start it, change a price: the page follows.
 F4 (medium) Layout shift under 0.1 at 360 and 390 on /business, /pricing and /wishes/love (reserve the space of
    what arrives late; measure dark and light); a kind with no style on shows the designed not-found page (with the
    Nav), not the bare Next 404.
Checks (quiet logs, EXIT lines): typecheck, lint, check:css, `npm run gates` (0 fail; the unbacked-promises gate
passes because each restored promise names its mechanism, not because the words are gone), `npm run test:client`,
`npm run build`, your flow. Pictures of /pricing, /business, /how and /creators at 360 light into
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/p-w1-pics/. Commit on w1-site1; do not push; remove your worktrees, stack and databases; leave no
background jobs. Hand back ONCE in 10 lines: head; F1-F4 closed or not with file:line; a list of every sentence
restored (one line each); REQUESTS; NOT RUN.
