VERIFIER ADM-A | TIER T1 lean | Budget 45 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md and /home/user/Firstwish-API/build/tasks/ADM.md (top, ADM-A bundle, Current state).
Under test: local branch `adm-a` (head 863f095) of /home/user/Firstwish-web; base claude/sleepy-mayer-f0hkb8. Make your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-adm-a-web (detached at adm-a; `ln -s /home/user/Firstwish-web/node_modules node_modules`), dev server port 3516 (NEXT_DIST=.next-vadma);
remove both when done; kill by PID only. The builder's pictures are in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-a/ (look at 6 of them, both sizes, both modes).
CLAIMS (each one: PASS or FAIL with what you saw):
 1. /admin signed out goes to /admin/sign-in; an email then any 6 digits lands on /admin with a "Sample data" marker.
 2. At 360 and 390 wide a menu button opens a drawer with all 18 sections, who is signed in and their role; at 1440 x 900 the side nav
    shows all 18 without scrolling; /admin/moderation shows only "Not built yet"; /admin/nope is a 404.
 3. /admin shows Sealed, Opened, Paid, Taken, takings for the eight lines, 7 "Needs someone" rows; "Wishes taken down" opens
    /admin/wishes?state=down with 1 row; failed payments and failed messages link to their wish or person.
 4. /admin/wishes: "0001" leaves one row; "Resting" leaves one row; 10 wishes are 2 pages of 8; wish 0001 shows life, ticket, payments,
    messages; "Take down" will not confirm without a reason; after it the pill, timeline and list row say "Taken down"; restore, extend
    7 days, resend the link, start a refund each show their result.
 5. /admin/people: "tunde" or "0142" leaves one row; Adaeze shows sides, the Pass, wishes, payments, a record; ban shows a banner and
    "Banned"; lifting it returns "Active" with the reason in the record.
 6. After /admin, moving client-side (window.next.router.push) to /app, /app/pro, /app/creator/studio: layout same as a fresh load.
Attacks: no sideways page scroll at 360, 390, 1440 on every admin page and with the confirm sheet and drawer open; keyboard: Tab reaches
every control, Escape closes the sheet and drawer, focus is visible; zero console errors; every button does something (no dead control);
no native select/date/alert/confirm; every class in styles/admin.css starts fo- and no bare element rule; grep the branch's files for
localStorage, sessionStorage, IndexedDB (R10: any hit is a finding) and for SMS or WhatsApp wording (R11: each place is a finding, list
file:line); numbers that exist in lib/catalog.ts or lib/pro-data.ts are read from there, not retyped (list any retyped price);
light and dark both readable (no ink-on-ink). Checks: `npx tsc --noEmit`, `node scripts/check-css.mjs`, quiet logs, EXIT lines.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-a/VERDICT.md (40 lines or fewer): each claim, findings with severity (blocker, high, medium, low), file:line, how to
see it. Hand back in 20 lines or fewer: verdict merge or fix; findings by severity, one line each; what you did not run and why.
