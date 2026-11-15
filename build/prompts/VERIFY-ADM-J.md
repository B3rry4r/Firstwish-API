VERIFIER ADM-J | TIER T1 lean | Budget 55 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md and build/tasks/ADM.md (top; Current state, the ADM-J entry), build/prompts/ADM-J.md (the cases).
Under test: local branch `adm-j` (head 2f0c035) of /home/user/Firstwish-web; base claude/sleepy-mayer-f0hkb8 (fbdde93). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-adm-j-web (detached at adm-j; node_modules by `cp -al /home/user/Firstwish-web/node_modules`), dev server port 3556 (NEXT_DIST=.next-vadmj);
stop it by PID and `git worktree remove` yours when done. The builder's pictures: /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-j/ (look at 10 across sections: they go to the owner).
Sign in at /admin/sign-in with any email and six digits (the session lives in memory: move between pages by the nav, not by reload).
CLAIMS (each: PASS or FAIL with what you saw):
 1. Deciding a report "Keep" on /admin/moderation drops the Overview "Reports to act on" count by exactly 1, and /admin/audit gains one
    row for it under Moderation with who, when and why.
 2. Taking wish 0004 down on its page makes it read "Not listed" and removes it from /admin/showing's list; one audit row.
 3. /admin/prices shows "Creators' payout threshold" ₦5,000 with a PROVISIONAL pill; changing it to ₦100,000 (with a reason) turns
    every "Due" on /admin/creators into "Rolls on" and writes an audit row under Prices.
 4. The audit's section filter offers the sections that have rows and filters to them; each row's "On" link opens the right page.
 5. One action in EACH of these writes exactly one audit row: restore a wish, ban a person, refund a payment, move a style's level,
    approve a style submission, mark a payout paid, assign a Concierge maker, reply to a support thread, change a setting.
 6. On /admin/numbers at 360 and 390 the chips sit below the title; at 1440 beside it. Other pages' block headers look as on the base.
 7. All 18 nav sections open with a title, no sideways scroll at 360, 390, 1440, zero console errors; no link lands on "Not built yet".
Attacks: the wording of audit rows reads as plain sentences (the builder's own report quotes "Changed from ₦5,000 to ₦5,000→₦100,000":
check what the row really says for a price change and a threshold change; garbled wording is a finding); an unknown /admin path in a
PRODUCTION build (`NEXT_DIST=.next-vadmj-prod npm run build` then `npx next start -p 3557`; quiet log) returns status 404, and the
build itself ends EXIT 0; a reason of 3 characters never confirms anywhere; Escape closes sheets; Tab reaches controls on Audit and
Prices; grep the diff for localStorage, sessionStorage, IndexedDB (R10), SMS or WhatsApp sending wording (R11), em-dashes in text a
user reads; every class added to styles/admin.css starts fo-; `npx tsc --noEmit` and `node scripts/check-css.mjs` EXIT 0;
/app and /app/pro after /admin by client-side moves look as on a fresh load (2 pictures each at 390).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-j/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low) one line each with file:line; what you did not run and why.
