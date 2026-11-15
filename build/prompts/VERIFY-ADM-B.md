VERIFIER ADM-B | TIER T1 lean | Budget 55 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md and /home/user/Firstwish-API/build/tasks/ADM.md (top, ADM-B bundle, Current state).
Under test: local branch `adm-b` (head 0ed2280) of /home/user/Firstwish-web; base claude/sleepy-mayer-f0hkb8 (7b2285b). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-adm-b-web (detached at adm-b; node_modules by `cp -al /home/user/Firstwish-web/node_modules`), dev server port 3526 (NEXT_DIST=.next-vadmb);
stop it by PID and `git worktree remove` yours when done. The builder's pictures: /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-b/ (look at 8: both sizes, both modes).
Sign in at /admin/sign-in with any email and six digits (the session lives in memory: move between pages by the nav, not by reload).
CLAIMS (each: PASS or FAIL with what you saw):
 1. /admin/moderation tiles read 3, 5, 1; the oldest item, wish 0004, shows "Late by ...".
 2. Taking down wish 0004 there removes the item, and /admin/wishes/0004 then shows "Taken down".
 3. Banning from the takedown request makes /admin/people/p_wanjiru show the account as banned.
 4. /admin/showing: approving the request for wish 0201 adds it to "Listed now"; it can then be picked as wish of the day.
 5. /admin/styles reads "All 43 styles"; after approving a submission on /admin/styles/review it reads 44.
 6. Moving a style's level on /admin/styles changes only the admin page; /app/styles is unchanged.
 7. Submission "Quiet Letters" fails two automatic checks ("Readable", "Holds in Portrait and Landscape").
 8. Marking Kemi's payout paid shows "Paid" with who, when, why; Kofi's row reads "Rolls on", ₦680 short of the ₦5,000 threshold.
 9. Every action opens the confirm sheet; Confirm stays off until a reason of 4+ characters.
10. Prices, the 20% share and credit allowances come from lib/studio.ts and lib/catalog.ts (list any retyped number, file:line);
    sample figures are marked as sample or PROVISIONAL on screen.
Attacks: no sideways page scroll at 360, 390, 1440 on each of the five pages, with sheets open; the 43-style table is usable at 360
(its own scroll box or cards, nothing cut); Escape closes sheets; Tab reaches every control; zero console errors; no dead control; no
native select/date/alert/confirm; every class added to styles/admin.css starts fo-, no bare element rule; grep the diff for
localStorage, sessionStorage, IndexedDB (R10) and SMS or WhatsApp sending wording (R11); wording on screen: says "kind" (never format,
category or type) for kinds of wish, Portrait and Landscape (never sideways), no "coming soon"; a flagged photo is shown in a way that
does not put a full-size flagged picture on screen without a click (say what you see); /admin and /admin/wishes/0001 still work.
Checks: `npx tsc --noEmit`, `node scripts/check-css.mjs` (quiet logs, EXIT lines).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-b/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low) one line each with file:line; what you did not run and why.
