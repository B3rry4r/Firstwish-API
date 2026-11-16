BUILDER WEB-API-4 | TIER T2 | The wired screens take up what the fourth API round serves, and the shared changes the lead has queued
Budget 190 steps. Machine: 4 CPUs, 15 GB; heavy agent: a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md FIRST and follow it (rules, measure, checks, hand-back). Then rulings HN1, HN2, HO7,
HK1, HM6, HP1-HP13 in /home/user/Firstwish-API/build/rulings-phase3.md and the two lists /home/user/Firstwish-API/build/sweeps/web.md and api-closed.md.
This is the ONE bundle allowed to change the shared modules (lib/api.ts, lib/session.ts, lib/staff-session.ts,
scripts/live/**): keep every exported name other bundles import working (builders for the maker, the receiver and the
business screens are running on older copies), and list every signature you changed.
Branch `web-api-4` (base head in your spawn line). FIRST run `API_DIR=<your API worktree> npm run contracts:sync` and
commit the copied contract file on your branch: the web branch keeps the older file until this bundle lands. Worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-4 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-4-api (API at the commit in your spawn line); ports
5480-5499; stack prefix wa4; measure file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-4-measure.txt; pictures /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/web-api-4-pics/.
You own for this bundle: lib/api.ts, lib/session.ts, lib/staff-session.ts, lib/person.ts, lib/admin/w13-api.ts,
components/admin/{Shell,SignIn}.tsx and nav.ts, the Team and Audit screens, components/admin/b/{Moderation,Showing,
Creators}.tsx, components/admin/People.tsx (search), components/app/feed/**, the wish cards and wish detail of the
person's app, scripts/live/**. NOT yours: the maker, app/w/**, app/app/pro/**, lib/admin/c-*.
Cases:
 1. First make it compile and run against the new contract: `npm run typecheck` on your base shows what the new types
    break; the staff Team writes send the `version` they read (a 409 stale_version shows the server's words and
    reloads the row); removed staff are not listed.
 2. One client (HN2): lib/api.ts takes a session option (the person's or the staff's: token source, refresh route,
    what ends it); lib/staff-session.ts uses it and its own copy of send, refresh sharing, retry and envelope goes;
    `npm run test:client` covers both sessions (one refresh in flight per session; a staff 401 never refreshes the
    person's session and the reverse).
 3. Roles from the server (HP1): the admin shell and every staff screen draw sections and controls from the staff
    session's `sections`; the client copies of the role table (lib/staff-screens.ts STAFF_ACTIONS, W13_ACTIONS) go
    for sections; an action table stays only where the server gives no per-action read (say which, and list it under
    REQUESTS).
 4. Staff sign-in words (HO7): "If this email is on the team, a code is on its way."; the Audit filters offer every
    section the contract has and every staff member the Team read gives this role.
 5. Staff screens: the held photo is drawn for the roles the server gives it to (heldPhoto.url; nothing for others);
    the wish-of-the-day picks for today and the next 6 days are read from GET /v1/admin/showing/days and shown after
    a reload; creators show which payout months are due (payoutMonths) and "Mark paid" is offered only for a due
    month, picked from a list (no typed YYYY-MM); people search says it also takes a wish number.
 6. The person's app: wish cards and wish detail draw the owner's pictures (the wish read's `pictures`: a ready one
    by its url, a screening one as "being checked", a refused one with the server's words; a url is refetched when it
    has expired, never stored); the wish read's `video` state decides whether Video is asked; a heart and a save
    survive a reload (the feed row's `mine`); a published row draws its cover and its creator by handle.
 7. Casts go (HO6): lib/person.ts and lib/admin/w13-api.ts import the contract's types wherever the contract now has
    them; list every cast that must stay and the API request beside it.
 8. No-session words (HM6): a refused refresh with code no_session shows nothing; any other refusal shows the
    server's words on the sign-in screen (the erased-account case) for the person and for staff.
 9. The live driver: the stack sets STANDIN_MAIL_OUTBOX and every flow reads sign-in codes from that file
    (scripts/live/standin.mjs's planted code goes); each flow makes and removes ONLY its own data (flows/w11.mjs's
    delete of all payments goes; its "numbers empty" check uses its own fresh state); the whole `npm run live:drive`
    passes on one fresh stack with every merged flow, twice in a row; STANDIN_CLOCK_OFFSET is available to flows.
10. The uncaught "Event" console line the maker shows once in a while at the wedding-day step is the maker
    builder's to fix: if your driver run shows it, report the stack and URL, do not chase it.
Measure every screen you changed at 360x740, 390x844, 1440x900 as P6-COMMON says (the staff Moderation with a held
photo, Now Showing with picks on three days, Creators with a due month, Team after a stale change, Home with a cover
and a kept heart after a reload, a wish card with a picture).
