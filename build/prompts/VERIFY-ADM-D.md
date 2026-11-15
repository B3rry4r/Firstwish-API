VERIFIER ADM-D | TIER T1 lean | Budget 55 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md and /home/user/Firstwish-API/build/tasks/ADM.md (top, ADM-D bundle, Current state).
Under test: local branch `adm-d` (head 75aed3f) of /home/user/Firstwish-web; base claude/sleepy-mayer-f0hkb8 (7b2285b). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-adm-d-web (detached at adm-d; node_modules by `cp -al /home/user/Firstwish-web/node_modules`), dev server port 3546 (NEXT_DIST=.next-vadmd);
stop it by PID and `git worktree remove` yours when done. The builder's pictures: /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-d/ (look at 6: both sizes, both modes).
Sign in at /admin/sign-in with any email and six digits (the session lives in memory: move between pages by the nav, not by reload).
CLAIMS (each: PASS or FAIL with what you saw):
 1. /admin/support opens on 3 "Needs a reply" threads; searching "0004" finds one thread that links to wish 0004 and to Yaw Mensah.
 2. On a thread, the saved reply "Link sent again" fills the reply box; sending asks for a reason; then the thread shows "Waiting on
    them" and the reply appears in the delivery log on /admin/messages.
 3. A closed thread has no reply box and offers "Open again".
 4. /admin/messages lists Sealed, Opens today, Opened, Resting soon, Sign-in code, all marked Email; saving edited wording shows
    "Edited <time> by <name>".
 5. Under the Failed filter "Send again" asks for a reason, then the row shows "Sent again ... by ..."; a failed message can be sent again once only.
 6. /admin/numbers shows 8 earning lines against targets, marked PROVISIONAL; "Last 7 days" changes the figures; Table shows the same 8 lines.
 7. Team: an invite adds an "Invited" row; a removed person stays listed as "Removed"; the owner row has no Remove button.
 8. Settings: choosing DigitalOcean Spaces or flipping a switch asks for a reason, and the newest Audit row shows the change with it.
 9. WhatsApp and SMS appear nowhere in these sections; nothing is stored in the browser (grep the diff: localStorage, sessionStorage, IndexedDB).
Attacks: no sideways page scroll at 360, 390, 1440 on each of the six pages and a thread, with sheets open; the charts are readable at
360 (labels not cut, figures not overlapping) in light and dark; Escape closes sheets; Tab reaches every control; zero console errors;
no dead control; no native select/date/alert/confirm; every class added to styles/admin.css starts fo-, no bare element rule; no chart
library added to package.json; the customer wording shown in Messages breaks no owner rule (no "forever", "launch", "coming soon",
"abroad", "diaspora", no emoji, no em-dash); role limits: sign in is always Owner on sample data, so say whether a non-owner view can
be reached at all (if not, report "not reachable, not tested"); /admin, /admin/wishes/0001 still work (shared files only gained blocks).
Checks: `npx tsc --noEmit`, `node scripts/check-css.mjs` (quiet logs, EXIT lines).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-d/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low) one line each with file:line; what you did not run and why.
