PATCH ADM-J round 1 | TIER T1 | Budget 30 steps. Fix only the findings below; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-j/VERDICT.md.
Local branch `adm-j-p1` from claude/sleepy-mayer-f0hkb8 (ADM-J is merged there) of /home/user/Firstwish-web; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-adm-j-web
(node_modules by cp -al); ports 3561 (dev, NEXT_DIST=.next-padmj) and 3562 (production start, NEXT_DIST=.next-padmj-prod).
 F1 (medium): in a PRODUCTION build an unknown /admin path (for example /admin/nope) answers HTTP 200 with the 404 text. It must answer
    404, as /zzzz-unknown does. Cause named by the verifier: the streamed admin Shell in front of app/admin/[...rest]/page.tsx calling
    notFound(). Fix it the simplest way that keeps every real admin page working (for example drop the catch-all so the app's own
    not-found answers, or keep it out of the streamed shell). Prove with curl -s -o /dev/null -w "%{http_code}" on the production start:
    /admin/nope -> 404; /admin/sign-in -> 200; /admin/wishes -> 200.
 F2 (low): the payout threshold's change sheet is headed "NEW PRICE, NAIRA" (components/admin/c/Prices.tsx): for the threshold it reads
    "New threshold, naira".
 F3 (low): taking a wish down also clears it as wish of the day (it still showed 0004 on /admin/showing after its take-down).
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`; `node scripts/check-css.mjs`; `npm run build` (with your NEXT_DIST) EXIT 0; the three
curl lines; a short Playwright check of F2 and F3 at 390 x 844; zero console errors. Restore tsconfig.json if the build or dev server touched it.
Commit on `adm-j-p1` (do not push); stop your servers by PID; remove your worktree. Hand back in 8 lines: head sha; each finding
closed or not with proof; EXIT lines.
