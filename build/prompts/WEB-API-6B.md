BUILDER WEB-API-6B | TIER T2 | Business: a login gets in; the Plan says what paying does; import rows; the logo
Budget 190 steps. Machine: 4 CPUs, 15 GB; heavy agent: a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md FIRST and follow it (rules, how to wire, measure, checks, hand-back). Then rulings
HR1, HR2, HR4, HR5, HU5 in /home/user/Firstwish-API/build/rulings-phase3.md and the W8 rows of /home/user/Firstwish-API/build/sweeps/web.md.
Screens (all wired already; this adds to them): pro-home pro-wishes pro-wish-detail pro-people pro-brand pro-plan, and
the app shell's way into them.
Branch `web-api-6b` (base head in your spawn line); worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-6b (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-6b-api
(API at the commit in your spawn line); ports 5640-5659; stack prefix wa6b; measure file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-6b-measure.txt; pictures /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-6b-pics/.
You own: components/app/AppShell.tsx and Switcher.tsx, app/app/you/page.tsx (the business row only), app/app/pro/{page,
layout}.tsx, app/app/pro/{plan,people,brand,wishes}/**, components/app/pro/ui.tsx, scripts/live/flows/wa6b.mjs. NOT
yours: app/app/pro/{vault,reveal,favourites}/** and components/app/pro/vault.tsx (another builder's), the maker,
lib/api.ts and lib/session.ts (import-only; needs go under REQUESTS), components/app/life/PayStart.tsx (import-only).
Run every command with your own worktree as the working directory. Sign-in codes: scripts/live/standin.mjs codeFor.
Cases:
 1. A login of a business (the /me read's businesses and the role it gives): the shell and the switcher open the
    business pages for them, with no "Add a business" in the way; a control the server refuses to a login (plan,
    brand, team, as the server answers) is not drawn; a removed login meets the server's words (login_removed) and is
    taken back to their own side (HU5); a person in two businesses switches between them.
 2. Plan (HR1): each plan on offer says what a payment now would do, in the server's words and days; a second start
    while one is pending shows the server's 409 words and leads to the pending payment, never a second one; after a
    return the screen shows where the payment was started from (HR2).
 3. Import (HR5): the result lists every row the server refused with its reason and what was added; a doubtful
    double is asked about; nothing is counted that the server did not store.
 4. Brand: the logo goes up by the upload flow (signed put, progress, retry, the server's limits and words,
    screening) and is drawn from the server's read where the brand shows; removing it.
 5. A removed draft client wish says when it comes back to the pack (returnsToPackOn, HR4), not that it already has.
 6. components/app/pro/ui.tsx: a wish's link is the server's /w/<slug> (never /w/mine?name=).
 7. Attacks you run yourself: two tabs paying for a plan; a login typing an owner-only request; a login removed
    while their tab is open; an import of 500 rows with 20 bad and 5 doubles; a logo that is not a picture.
The live flow (wa6b.mjs) makes and removes only its own data and joins `npm run live:drive`, which passes whole.
