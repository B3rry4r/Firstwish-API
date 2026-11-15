BUILDER ADM-J | TIER T1 | tasks J1 one audit log; J2 live Overview; J3 payout threshold in Prices; J4 Block wrap; J5 the sweep rows
Budget 120 steps. Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available.
Read /home/user/Firstwish-API/build/common-rules.md, build/tasks/ADM.md (Current state: what each bundle built and its defaults),
build/sweeps/admin.md. All four admin bundles are merged in /home/user/Firstwish-web on claude/sleepy-mayer-f0hkb8; you join them.
Owner's words: > "Please design the whole dashboard thing and let me see." (R4) > "payout threshold ... you have to suggest" (R14: ₦5,000, PROVISIONAL, changeable).
Covers: the seams between the four bundles, front end only on sample data. Does not cover: new sections, any real server call, a redesign.
Cases (input -> expected):
 J1: any staff action with a reason, in any section (take down or restore a wish, ban, refund, move a style's level, approve a
     submission, decide a report, mark a payout paid, change a price, assign a maker, reply, settings) -> one row on /admin/audit with
     who, what, on what (linked), when, why, and its section in the section filter. One store, one write function every section calls.
 J2: /admin "Needs someone" counts are read from the real queues (reports, flagged photos, takedown requests, publish requests, styles
     sent in, support threads waiting, wishes taken down): decide a report on /admin/moderation -> the Overview count drops by one;
     each row links to its own page. No nav item or Overview link lands on "Not built yet" any more (an unknown /admin path is still a 404).
 J3: /admin/prices lists "Creators' payout threshold" ₦5,000 marked PROVISIONAL; changing it (confirm sheet, reason) changes who is
     "Due" and who "Rolls on" on /admin/creators at once, and writes an audit row. One constant holds it, read by both.
 J4: Block in components/admin/ui.tsx takes `wrap`: on a phone the header's chips go under a long title instead of squeezing it;
     used on /admin/numbers. Every other Block looks as before.
 J5: close each row of build/sweeps/admin.md (name which, by its text, in the hand-back).
Files: app/admin/**, components/admin/**, lib/admin-*.ts, lib/admin/**, styles/admin.css. Out of scope: everything else.
Not built means not drawn. Class prefix fo-. Numbers that exist in lib/catalog.ts, lib/pro-data.ts, lib/studio.ts are read, never retyped.
Work: local branch `adm-j` from claude/sleepy-mayer-f0hkb8; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-adm-j-web (node_modules by cp -al); port 3551 (NEXT_DIST=.next-admj).
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`; `node scripts/check-css.mjs`; a Playwright walk of J1-J4 at 360 x 740, 390 x 844,
1440 x 900 (light and dark at 390 and 1440): no sideways page scroll, zero console errors; open every one of the 18 nav sections once
at 390 and 1440 and save a picture of each to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-j/ (these go to the owner: look at each, fix what is broken).
Update ADM.md's Current state. Commit (do not push); remove your worktree. Hand back in 10 lines: head sha; per task done or partial
with proof; CLAIMS one per line, testable; what did not run; EXIT lines.
