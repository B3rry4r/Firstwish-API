BUILDER ADM-B | TIER T1 | tasks ADM-B1 Moderation; ADM-B2 Now Showing; ADM-B3 Styles and style review; ADM-B4 Creators and payouts
Budget 180 steps. Machine: 4 CPUs, 15 GB, about 20 GB free disk; at most 4 heavy agents (a heavy job only at 5 GB available).
Read /home/user/Firstwish-API/build/common-rules.md, then /home/user/Firstwish-API/build/tasks/ADM.md (the top, the ADM-B bundle, Current state).

Owner's words: > "The admin dashboard, I've not seen what it looks like ... Please design the whole dashboard thing and let me see." (15 Nov 2026).
Covers: staff screens, front end only, shown to the owner before the backend build. Does not cover: any real server call.
Stand on ADM-A (merged): the shell and nav (app/admin/layout.tsx), the shared parts (components/admin/ui.tsx: use them, add a prop if one
is short, never fork or restyle them), the seam (lib/admin-api.ts: each function names its /v1/admin request and returns marked sample
data), fixtures and types. Three other builders add sections at the same time: in the shared files (lib/admin-api.ts, lib/admin-fixtures.ts,
lib/admin-types.ts, styles/admin.css, the nav list) only ADD, each addition in one block headed `/* ADM-B */` at the END of the file; put
what you can in your own files (lib/admin/b-*.ts, components/admin/b/**) and re-export. Class prefix fo-. Numbers that exist in
lib/catalog.ts, lib/pro-data.ts, lib/studio.ts, lib/levels.ts are read from there, never retyped.
For anything unclear pick the safest default, write "Default (lead), owner may override" in ADM.md's Current state and go on. Ask nobody.

Cases (input -> expected):
  B1: /admin/moderation: three queues (reports, photos flagged by screening, takedown requests) with counts; an item shows what, who, the
      wish, and its 24-hour clock (late ones marked); decide (take down, keep, ban the account) with a reason -> it leaves the queue.
  B2: /admin/showing: publish requests (screened, then a person approves or declines with a reason), listed wishes (unlist), and wish of
      the day (pick one for a date).
  B3: /admin/styles: all 43 styles from the registry with level, kinds, use and preview-to-paid rate; move one between Starter, Standard
      and Premium with a reason; switch one off and on. /admin/styles/review: creators' submissions: recorded preview, the automatic
      checks, rights confirmed; approve and place at a level, or send back with notes.
  B4: /admin/creators: plan, credits, styles, earnings; the monthly payout run: who is past the threshold (PROVISIONAL figure), mark paid.
Files (touch nothing else): app/admin/moderation/**, app/admin/showing/**, app/admin/styles/**, app/admin/creators/**, components/admin/b/**, lib/admin/b-*.ts, and the additive blocks named above.
Out of scope: other bundles' sections; any file outside the list (need a shared change? say so in the hand-back).
Not built means not drawn: no do-nothing button, no placeholder row. Every action opens the confirm sheet, takes a reason, and the row
shows the new state (in memory, through the seam). An invented number is PROVISIONAL (sample data is marked as sample).

Work: local branch `adm-b` from claude/sleepy-mayer-f0hkb8; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-adm-b-web; dev server port 3521 (NEXT_DIST=.next-admb).
Checks (quiet logs, gate on the EXIT line): `npx tsc --noEmit`; `node scripts/check-css.mjs`; a Playwright walk of your cases at 360 x 740,
390 x 844 and 1440 x 900, light and dark: no sideways page scroll, zero console errors; pictures of each screen and each drawn state at
390 and 1440 in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-b/ (look at them yourself, fix what is broken). Then /app and /app/pro by client-side moves after /admin: unchanged.
Update ADM.md's Current state (your lines only). Commit (do not push). Hand back in 10 lines: head sha; per task done or partial with its
proof; CLAIMS one per line, testable by someone who has not read the code; what did not run and why; EXIT lines.
