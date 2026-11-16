BUILDER WEB-API-6A | TIER T2 | The link: keep and wake with no account; a friend adds a voice
Budget 190 steps. Machine: 4 CPUs, 15 GB; heavy agent: a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md FIRST and follow it (rules, how to wire, measure, checks, hand-back). Then rulings
HS1, HS2, HU1-HU4 in /home/user/Firstwish-API/build/rulings-phase3.md, and the contract's E-257..E-265.
Screens: the receiver's link (/w/<slug>: already wired; this adds to it), maker-ask-voices-gather, and ONE new page
/g/<slug> (the friend's page; it is not on the design canvas: build it only from parts the receiver's page and the
maker's voice step already have, and say so in the hand-back with its pictures for the owner).
Branch `web-api-6a` (base head in your spawn line); worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-6a (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-6a-api
(API at the commit in your spawn line); ports 5620-5639; stack prefix wa6a; measure file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-6a-measure.txt; pictures /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-6a-pics/.
You own: app/w/[slug]/** and its components, app/g/** (new), the maker's ask-voices-gather step (its own component
file only), scripts/live/flows/wa6a.mjs. NOT yours: the rest of the maker (Seal and pay are another builder's),
app/app/pro/**, lib/api.ts and lib/session.ts (import-only; needs go under REQUESTS).
Run every command with your own worktree as the working directory. Sign-in codes: scripts/live/standin.mjs codeFor.
The stack takes real uploads and can move time (STANDIN_CLOCK_OFFSET). Nothing is stored in the browser (R10): what a
payment's return needs travels in the link.
Cases:
 1. At the link: a live wish with a keep offer in the public view shows "Keep it longer" with the server's price and
    term; a resting wish says it is resting and offers the wake; a house wish offers neither and no report (HU2); a
    wish with a passcode offers them only after the unlock.
 2. Paying (HU1): the payer gives an email, said to be for the receipt, and NO account is made or implied; the start
    goes to the server (keep or wake) and the provider's return lands back on the link, where the result is read by
    reference with the holder's proof: pending, paid (kept until which day), failed (try again), refund due (someone
    else's payment settled first: the server's words, HU3). An email that has an account and one that has none get
    the same screens.
 3. /g/<slug>: who is asking and for whom (first names, as served), one voice note (the upload flow: signed put,
    progress, retry, the server's limits and words, screening) and the friend's first name; the states: off (the
    owner turned it off), full, the wish already open, sent, refused, could not load. Nothing else of the wish.
 4. The maker's gather step: the link from the server (copy, share), on and off, voices as they arrive (read again on
    focus and on a short interval while the step is open), remove one (asks first), how many of the 12 friends'
    places are taken (the owner's own voice is not counted, HU4).
 5. The ring's "Yes" after a reload is one person: the web sends no visit id of its own (the server's own hash
    decides).
 6. Attacks you run yourself: two holders pay for one wish at once; the owner pays while a holder's payment waits;
    a paid return opened twice and in another browser; a forged reference; 13 friends on one link; a friend's file
    over the limit; the link turned off while a friend records; keep on a house wish by a typed request.
The live flow (wa6a.mjs) makes and removes only its own data and joins `npm run live:drive`, which passes whole.

ADDED 16 Nov: the driver has carried ONE known FAIL since the sixth API round: scripts/live/flows/w7*.mjs "resting,
ended and removed: the server's 410 words" (status=200/410). Case 1 closes it: the resting state is drawn from the
server's 200 answer, and that check then expects it (ended and removed stay 410). The driver ends with 0 FAIL.
