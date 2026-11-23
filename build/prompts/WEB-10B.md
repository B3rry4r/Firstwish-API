BUILDER WEB-10B | TIER T2 (a paid extra; a receiver's secret) | Budget 150 steps. The wish page's video and the maker's ticket step follow the server's round 19; change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started);
never touch scripts/gates/** or the baseline file; final suites in the FOREGROUND; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md; rulings IK1 to IK6 with IK2a, IK3a, IK4a (the END of /home/user/Firstwish-API/build/rulings-phase3.md), HP5, IJ3,
IJ3a there, R10 in /home/user/Firstwish-API/build/rulings.md; the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ua-rows/VERDICT.md (UA-725) and lines
of /home/user/Firstwish-API/build/sweeps/web.md that name WEB-10B.
Work: a new local branch `web-10b` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-10b (`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-10b-api at the API commit in
your spawn line; FIRST `API_DIR=<it> npm run contracts:check` (exit 0). Ports 5660-5679; stack prefix w10b; BUILT. The
server's stand-in video renderer is on with PROVIDERS=standin; STANDIN_VIDEO=fail makes it fail (pass it through the
stack script's environment; a second stack for the failing case is fine, one at a time).
You own: app/app/wishes/[id]/page.tsx and components/app/life/sheets.tsx (the video only), components/app/maker/Ticket.tsx
and lib/seal.ts (refusals only), lib/draft.ts (the one `passcode` cast), components/app/maker/Maker.tsx (the step guard
only), one new flow scripts/live/flows/w10b.mjs and its line in scripts/live/drive.mjs. A shared component: add a prop, never a copy.
Cases (a real browser at 360 first; each a check in w10b.mjs; FIRST show what the head does today):
 1. A wish that HOLDS the video (its ticket includes it, or the extra was bought) is never shown the price again
    (sheets.tsx:102, page.tsx:116: `mayBuy` ignores what the wish holds): it shows the video's state from the server
    (HP5): not asked (one button to ask), being made (words, no dead button; the page learns when it is ready without
    a reload storm: say how often it reads), ready (a Download that fetches the server's short-lived address fresh
    at each tap: `downloadUrl` lasts 10 minutes; the file really downloads from the stand-in), failed (words and Ask
    again: one job, no second payment).
 2. A wish that does not hold it: the offer with the server's price ONLY when the wish read says the extra can be
    bought (`extrasOpen`); where the server says it is not sold (no renderer: 409 extra_not_sold) no offer is drawn;
    a start refused anyway shows the server's words. A paid wish that meets "cannot be made right now" (503) shows
    the server's words ("...you will not pay again...") and Ask again later, never the price.
 3. Refunds (IJ3, IK4a): the extra's refund sent or done: no Download, and the page says what the server says; the
    wish read and the video read never disagree on screen.
 4. A passcode or question wish: the ask says once, before asking, "This video shows your wish without its passcode."
 5. The maker's ticket step: a ticket the server will not sell right now (GET /v1/ticket-offers 409 extra_not_sold)
    is drawn as not available with the server's words, the others stay buyable, nothing looks like a crash; with
    the stand-in everything is buyable as today.
 6. A seal refused for a missing secret (422, round 19's words): the ticket screen shows the words with one button
    back to the opening step (Ticket.tsx:288 has no way back today). And the low L2b: in-app Back then Forward to a
    later step re-checks the secret like a visit by address does.
 7. lib/draft.ts: the cast that sends `passcode: null` goes (the contract now types it string or null).
Also 390 and 1440: no side scroll; one light/dark pair per video state into /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-10b/.
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint`
(867 warnings or fewer), `npm run check:css`, `npm run build`; w10b.mjs twice: 0 FAIL; w10a.mjs and the wish page's
existing flows (name them) once: 0 FAIL. Commit on web-10b; do not push; stop your stacks by PID; remove both
worktrees. Hand back ONCE in 10 lines: head; each case before and after; files changed; what was NOT run.
