BUILDER ADM-A | TIER T1 | tasks ADM-A1 shell, sign-in, shared parts, seam; ADM-A2 Overview; ADM-A3 Wishes; ADM-A4 People
Budget 180 steps. Machine: 4 CPUs, 15 GB, about 20 GB free disk; at most 4 heavy agents.
Read /home/user/Firstwish-API/build/common-rules.md, then /home/user/Firstwish-API/build/tasks/ADM.md (the top and the ADM-A bundle).

Owner's words: > "The admin dashboard, I've not seen what it looks like ... Please design the whole dashboard thing and let me see." (15 Nov 2026).
Covers: staff screens, front end only, shown to the owner before the backend build. Does not cover: any real server call.
Defaults already chosen: routes under app/admin/**, components/admin/**, styles/admin.css with prefix fo-, lib/admin-api.ts (seam) and
lib/admin-fixtures.ts (marked sample data), the app's own tokens and icons (components/app/Icon.tsx), no native controls (use the app's
own: see components/app/ui or the pro dashboard's parts in components/app/pro/ui.tsx for the house pattern; add a prop, never fork).
For anything else unclear pick the safest default, write "Default (lead), owner may override" in ADM.md's Current state and go on. Ask nobody.

Cases (input -> expected):
  A1: /admin signed out -> /admin/sign-in; enter a staff email, then any 6 digits through the seam -> /admin. Phone 360: nav is a drawer,
      every section reachable; desktop: side nav with every section of ADM.md listed (B, C, D sections show as links that open a plain
      "Not built yet" page only if their route is missing: do not draw fake content for them).
  A2: /admin shows today's counts, takings by the eight lines, and "Needs someone" rows that link to /admin/wishes or the queue named.
  A3: /admin/wishes: search "0001" finds the wish; filter by state; open one -> timeline, ticket, payments, messages; each action opens the
      confirm sheet, asks for a reason, and the row shows the new state (in memory, through the seam).
  A4: /admin/people: search by name or phone; open one -> sides, Pass, wishes, payments; ban and lift a ban with a reason.
Files (touch nothing else): app/admin/**, components/admin/**, styles/admin.css, lib/admin-api.ts, lib/admin-fixtures.ts, lib/admin-types.ts.
Out of scope: the sections of ADM-B, ADM-C, ADM-D; any file outside the list (need a shared change? say so in the hand-back).
Not built means not drawn: no do-nothing button, no placeholder row. An invented number is PROVISIONAL (sample data is marked as sample).

Work: local branch `adm-a` from claude/sleepy-mayer-f0hkb8; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-adm-a-web; dev server port 3511 (NEXT_DIST=.next-adma).
Checks (quiet logs, gate on the EXIT line): `npx tsc --noEmit`; `node scripts/check-css.mjs`; a Playwright walk of the four cases at
360 x 740, 390 x 844 and 1440 x 900, light and dark: no sideways page scroll, zero console errors; pictures of each screen at 390 and 1440
saved to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-a/ (look at them yourself and fix what is broken). Then walk /app, /app/pro and /app/creator/studio by client-side
moves after /admin and confirm their layout is unchanged (your stylesheet stays loaded: this is how class clashes show).
Update ADM.md's Current state (30 lines or fewer). Commit (do not push). Hand back in 10 lines: head sha; per task done or partial with its
proof; CLAIMS one per line, each testable by someone who has not read the code; what did not run and why; EXIT lines.
