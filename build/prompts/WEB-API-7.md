BUILDER WEB-API-7 | TIER T2 | Studio's files, Signed off, and the book's new values on the screens that draw them
Budget 190 steps. Machine: 4 CPUs, 15 GB; heavy agent: a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md FIRST and follow it (rules, how to wire, measure, checks, hand-back). Then rulings
HW2-HW4, HX1, HX3, HX4, R10, R14 in /home/user/Firstwish-API/build/rulings.md and rulings-phase3.md, and the contract's E-266, E-267, E-268,
PATCH /v1/studio/me, the price-book read's payout and limits, E-124.
Screens (wired already; this adds to them): studio-editor studio-new studio-home creator-profile creator-published,
the staff Prices screen, and the wish player where it plays a creator's style.
Branch `web-api-7` (base head in your spawn line); worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-7 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-7-api
(API at the commit in your spawn line); ports 5660-5679; stack prefix wa7; measure file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-7-measure.txt; pictures /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-7-pics/.
You own: app/app/creator/** and components/app/studio/**, lib/studio-api.ts, components/admin/c/Prices.tsx, the one
loader the wish player uses for a style's files (name it; nothing else of the player), scripts/live/flows/wa7.mjs.
NOT yours: the maker, app/w/** beyond that loader, lib/api.ts and lib/session.ts (import-only; REQUESTS).
Run every command with your own worktree as the working directory. Sign-in codes: scripts/live/standin.mjs codeFor.
The stack takes real uploads. Nothing is stored in the browser (R10): a picture's address is read from the server
each time and asked for again when it has expired.
Cases:
 1. Pictures come back to the editor (the controls an earlier patch stopped drawing: the Add panel's artwork tab
    and shelf, an element's backdrop, a picture fill): the upload flow (signed put, progress, retry, the server's
    limits and words, screening: "being checked", refused with the server's words), drawn from the server's read
    after a reload and on a second device, placed on a scene, removed; a draft's delete takes them (HX3).
 2. A poster, a sound and a 3D model where the Studio design draws them, by the same flow, with the book's limits
    in the server's words; nothing the design does not draw is added.
 3. The creator's profile picture: upload, shown on the profile, the switcher and the public creator line.
 4. Signed off and Creator to Open (HW3): each asks first and says what the server says (runs until which day, not
    renewed, nothing refunded); back on before that day costs nothing; after it, the pay path.
 5. The payout threshold and day are the book's (R14, HW4) wherever Studio says them; no figure typed in the web.
 6. Published reads `publish` from the wishes list (no second read per wish).
 7. A wish in an APPROVED creator style plays with that style's pictures and sound at the receiver's link and in
    the owner's preview (E-266); a file that fails or is still being checked leaves the style's own fallback, never
    an empty frame.
 8. Staff Prices: the limits and payout values are listed with their kinds (bytes shown as MB, hours, days, naira),
    changed by the roles the server allows (others see no control), with the server's words on a refusal, and the
    audit line shows old and new.
 9. Attacks you run yourself: 30 pictures in one draft; a picture over the limit; two devices adding at once; the
    API frozen mid-upload; another creator's style id typed in the address; an erased creator's approved style
    still plays (HX4).
The live flow (wa7.mjs) makes and removes only its own data and joins `npm run live:drive`, which passes whole.
