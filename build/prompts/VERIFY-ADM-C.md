VERIFIER ADM-C | TIER T1 lean | Budget 50 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md and /home/user/Firstwish-API/build/tasks/ADM.md (top, ADM-C bundle, Current state).
Under test: local branch `adm-c` (head 5b5cdab) of /home/user/Firstwish-web; base claude/sleepy-mayer-f0hkb8 (7b2285b). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-adm-c-web (detached at adm-c; node_modules by `cp -al /home/user/Firstwish-web/node_modules`), dev server port 3536 (NEXT_DIST=.next-vadmc);
stop it by PID and `git worktree remove` yours when done. The builder's pictures: /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-c/ (look at 6: both sizes, both modes).
Sign in at /admin/sign-in with any email and six digits (the session lives in memory: move between pages by the nav, not by reload).
CLAIMS (each: PASS or FAIL with what you saw):
 1. /admin/payments shows 15 payments, 10 per page; FW-PSK-24D102 gives 1 row; "0004" (wish number) gives 2.
 2. FW-PSK-24A720 -> Refund: Confirm stays off until a reason of 4+ characters; after it the drawer, the row and the record say Refunded with the reason.
 3. "Start a refund" on /admin/wishes/0002 makes FW-PSK-24B002 read "Refund started" in Payments; "Send the refund" makes it Refunded.
 4. Ledger view: 15 Nov Paystack ₦12,000 against ours ₦6,000 with one line "At the provider, not in our ledger"; 10 Nov one line in
    ours only; 9 Nov amounts differ; 13 Nov "Agrees".
 5. /admin/businesses has 5 rows; Bakare Events shows "21 of 39" wishes, 612 GB, ₦6,000 billed for space, 4 invoices (latest Failed).
 6. /admin/concierge lists 5 deliveries due 15-21 Nov; C-0012 "Assign a maker" waits for a maker; after Femi Ojo and a reason it reads
    "Being made"; C-0013's report says 2 of 3 opened.
 7. /admin/prices shows Keepsake ₦6,000, Pro Studio ₦105,000, the 40% off ending 31 Jan 2027; typing 6000 says "That is the price now";
    7,000 with a reason makes the row ₦7,000 "Changed" and lists old, new, who, when, why.
Attacks: no sideways page scroll at 360, 390, 1440 on each of the four pages, with drawers and the confirm sheet open; Escape closes them;
Tab reaches every control; zero console errors; no dead control; no native select/date/alert/confirm; every class added to
styles/admin.css starts fo-, no bare element rule; `.fo-acts + .fo-stats` (the builder's rule) does not move anything on /admin,
/admin/wishes/0001 or /admin/people (compare with the base); the ADM-A screens still pass a quick look (the Confirm `ready` prop
left take-down on a wish working); grep the branch's diff for localStorage, sessionStorage, IndexedDB (R10) and for SMS or WhatsApp
sending wording (R11; the catalog extra's own name is not a finding); every price on /admin/prices is read from lib/catalog.ts,
lib/pro-data.ts, lib/studio.ts, lib/account.ts (list any retyped number, file:line); money is whole naira with the ₦ sign; light and dark
readable. Checks: `npx tsc --noEmit`, `node scripts/check-css.mjs` (quiet logs, EXIT lines).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-c/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low) one line each with file:line; what you did not run and why.
