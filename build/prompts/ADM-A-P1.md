PATCH ADM-A round 1 | TIER T1 | Budget 35 steps. Fix only the findings below; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md (Owner rules: R10 nothing stored in the browser, R11 email only) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-a/VERDICT.md.
Branch `adm-a` (head 863f095) of /home/user/Firstwish-web; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-adm-a-web (node_modules by `cp -al`, as common-rules says); port 3517 (NEXT_DIST=.next-padma).
Findings to close:
 F1 (medium, R10): lib/admin-api.ts:44,49 keeps the staff session in localStorage (`fo-staff`). Keep it in memory only (a module
    variable): a reload asks for sign-in again, which is what "Changes last until the page is reloaded" already says. No browser store.
 F2 (medium, R10): components/admin/Shell.tsx:27 has its own copy of the mode switch writing `fw-mode`. Export `useMode` from
    components/app/Switcher.tsx (an export only; the app's behaviour unchanged) and use it; delete the copy. (The app's own key is
    removed later, in the wiring phase; the admin must not add a second writer.)
 F3 (medium, R11): no SMS or WhatsApp sending anywhere in the admin: components/admin/Wish.tsx:17, lib/admin-api.ts:179,
    lib/admin-types.ts:25-26 (Channel becomes "email" only), lib/admin-fixtures.ts:106-113 (messages go "Email to a•••@gmail.com"),
    components/admin/nav.ts:29. People are found by name or email; a phone stays a plain masked detail on a person.
    Leave the catalog extra's own name ("Portrait video for WhatsApp status") as lib/catalog.ts has it.
 F4 (low): /admin/wishes?state=down then the "Wishes" nav item must clear the filter (components/admin/Wishes.tsx:30-33: follow the URL).
 F5 (low): the phone drawer traps focus while open (Tab cycles inside; Escape closes; focus returns to the menu button).
 F6 (low): timeline and banner say who by the staff member's name ("by Ops Lead"), never a single letter.
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`; `node scripts/check-css.mjs`; `grep -rn "localStorage\|sessionStorage\|indexedDB" app/admin components/admin lib/admin-*.ts` prints nothing;
`grep -rni "whatsapp\|sms" app/admin components/admin lib/admin-*.ts` prints only the catalog extra's name if at all; a short Playwright
walk at 390 x 844 and 1440 x 900: sign in, wish 0001 take down with a reason, drawer focus, the filter clears; zero console errors;
the claim "search 0142 finds one person" may change to an email search: say what the new search is.
Commit on `adm-a` (do not push); remove your worktree. Hand back in 8 lines: head sha, each finding closed or not with proof, EXIT lines.
