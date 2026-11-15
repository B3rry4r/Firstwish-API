BUILDER ADM-D | TIER T1 | tasks ADM-D1 Support; ADM-D2 Messages; ADM-D3 Numbers; ADM-D4 Team, Audit, Settings
Budget 180 steps. Machine: 4 CPUs, 15 GB, about 20 GB free disk; at most 4 heavy agents (a heavy job only at 5 GB available).
Read /home/user/Firstwish-API/build/common-rules.md, then /home/user/Firstwish-API/build/tasks/ADM.md (the top, the ADM-D bundle, Current state).

Owner's words: > "The admin dashboard, I've not seen what it looks like ... Please design the whole dashboard thing and let me see." (15 Nov 2026).
Covers: staff screens, front end only, shown to the owner before the backend build. Does not cover: any real server call.
Stand on ADM-A (merged): the shell and nav (app/admin/layout.tsx), the shared parts (components/admin/ui.tsx: use them, add a prop if one
is short, never fork or restyle them), the seam (lib/admin-api.ts: each function names its /v1/admin request and returns marked sample
data), fixtures and types. Three other builders add sections at the same time: in the shared files (lib/admin-api.ts, lib/admin-fixtures.ts,
lib/admin-types.ts, styles/admin.css, the nav list) only ADD, each addition in one block headed `/* ADM-D */` at the END of the file; put
what you can in your own files (lib/admin/d-*.ts, components/admin/d/**) and re-export. Class prefix fo-. Numbers that exist in
lib/catalog.ts, lib/pro-data.ts, lib/studio.ts, lib/levels.ts are read from there, never retyped.
For anything unclear pick the safest default, write "Default (lead), owner may override" in ADM.md's Current state and go on. Ask nobody.

Cases (input -> expected):
  D1: /admin/support: inbox of WhatsApp and email threads tied to a wish or a person; open one, reply, use a saved reply, close it.
  D2: /admin/messages: each message Firstwish sends (sealed, opens today, opened, resting soon, code) with its wording to edit and where
      it goes; a delivery log with failures and resend.
  D3: /admin/numbers: the eight earning lines against targets, preview to paid, opens, by kind, occasion and style, keeps; a period switch.
      Charts are drawn in SVG with the page's tokens (no chart library), readable at 360 wide, with the figures also in a table.
  D4: /admin/team: staff and roles (owner, ops, moderator, reviewer, support, finance, maker), what each role may open, invite and remove.
      /admin/audit: who did what, when, why; filter by person and section. /admin/settings: providers connected (payments, messages, email,
      AI, storage: Cloudflare R2 or DigitalOcean Spaces, one chosen) and switches (the 40% off, sample wishes off in production).
Files (touch nothing else): app/admin/support/**, app/admin/messages/**, app/admin/numbers/**, app/admin/team/**, app/admin/audit/**, app/admin/settings/**, components/admin/d/**, lib/admin/d-*.ts, and the additive blocks named above.
Out of scope: other bundles' sections; any file outside the list (need a shared change? say so in the hand-back).
Not built means not drawn: no do-nothing button, no placeholder row. Every action opens the confirm sheet, takes a reason, and the row
shows the new state (in memory, through the seam). An invented number is PROVISIONAL (sample data is marked as sample).

Work: local branch `adm-d` from claude/sleepy-mayer-f0hkb8; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-adm-d-web; dev server port 3541 (NEXT_DIST=.next-admd).
Checks (quiet logs, gate on the EXIT line): `npx tsc --noEmit`; `node scripts/check-css.mjs`; a Playwright walk of your cases at 360 x 740,
390 x 844 and 1440 x 900, light and dark: no sideways page scroll, zero console errors; pictures of each screen and each drawn state at
390 and 1440 in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-d/ (look at them yourself, fix what is broken). Then /app and /app/pro by client-side moves after /admin: unchanged.
Update ADM.md's Current state (your lines only). Commit (do not push). Hand back in 10 lines: head sha; per task done or partial with its
proof; CLAIMS one per line, testable by someone who has not read the code; what did not run and why; EXIT lines.
