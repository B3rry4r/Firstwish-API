VERIFIER W1 | TIER T1 with a copy audit, measured in a browser on a real API stack | Budget 90 steps. Machine: 4 CPUs,
15 GB; a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md FIRST and follow it (the parts that fit a public website: no sign-in);
the builder's brief is /home/user/Firstwish-API/build/prompts/W1.md.
Under test: /home/user/Firstwish-web local branch `w1-site1` (head in your spawn line) against its base f3cb452. Worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w1-site1 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w1-site1-api (API at the commit in your spawn line); stack prefix vw1;
ports 5520-5539; verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w1-site1/ (pictures in shots/).
FIRST, the copy (the website's words are the owner's): the builder REMOVED sentences it judged unbacked. Make
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w1-site1/copy.md: every user-visible sentence, label or figure that the branch removed or changed
on the nine pages, the Nav and the footer (`git diff f3cb452 -- app components lib/catalog.ts lib/occasions.ts`, read
the strings), one row each: the words before; the words after (or "removed"); the page; what backs the BEFORE words
(a line of /home/user/Firstwish-API/.pipeline/product-truths.json, a ruling in /home/user/Firstwish-API/build/rulings.md or rulings-phase3.md, the
product documents under /home/user/Firstwish-web/docs if any, or what the API really does: name the route or job) or
"nothing found"; your verdict: RESTORE (the product backs it: removing it was wrong), KEEP REMOVED (made up, or
contradicted by the API: say by what), or OWNER (a promise only the owner can make or drop). The builder named these:
the Proof testimonials, the "1 min" claim, the Soon cards (page, nav, footer), "Most popular", "delivered within 3
hours", "gone within 24 hours", "three months ahead by transfer", "keep that price 12 months", "₦8,000 to ₦12,000 a
package", "Both included on Signature" and the reaction lines, the `soon` list and the ₦ in category notes: find the
rest yourself. A removed sentence that the product backs is a HIGH finding (the owner's words deleted).
Then, each PASS or FAIL with numbers:
 - Every figure on the nine pages equals GET /v1/price-book on your stack (kobo exact; list each figure and its
   key); change three prices and the offer's end through the staff API: the pages follow within the cache time the
   builder states (60 s) with no rebuild; the VAT note only where the server marks it; no hand-typed price left in
   the files these pages import (grep ₦ and digits near "kobo|price|₦" in app/** components/site/** lib/catalog.ts
   lib/site-book.ts).
 - The API down at render and at regeneration: the builder says a failed regeneration REPLACES the good page with
   "could not be loaded" for up to 60 s: confirm; say whether the last good page could be kept instead and how bad
   it is for a visitor (a public pricing page with no prices).
 - Kinds and occasions follow the server's styles read (turn a kind's styles off: its page and links go).
 - Mode with no storage (R10): localStorage, sessionStorage, cookie and IndexedDB empty on every page after toggling;
   first paint follows the device in light and in dark (no flash: measure the background at first paint and after
   load); the choice carries through links into sign-up and the maker; the Nav's toggle works with JS on, and with
   JS off the page is still readable.
 - Every entry link ("Make a wish", "Start", plan buttons) lands where it says with its choice in the link (walk
   each: list href and landing).
 - Public-page basics on the built web: each page's title and description; JS off shows prices and kinds; layout
   shift at 360 (the builder: /pricing 0.046, / 0.012); 0 console errors; width and each control in its cell at
   360, 390, 1440; light and dark pictures of each page at 360 (open six yourself).
 - The 13 ui-align ids the builder marked not done: which would a visitor notice.
 - `npm run gates` (0 fail, no new finding; the stale ids), typecheck, lint, check:css, test:client, build.
