BUILDER ADM-C | TIER T1 | tasks ADM-C1 Payments, refunds, ledger; ADM-C2 Businesses; ADM-C3 Concierge; ADM-C4 Prices
Budget 180 steps. Machine: 4 CPUs, 15 GB, about 20 GB free disk; at most 4 heavy agents (a heavy job only at 5 GB available).
Read /home/user/Firstwish-API/build/common-rules.md, then /home/user/Firstwish-API/build/tasks/ADM.md (the top, the ADM-C bundle, Current state).

Owner's words: > "The admin dashboard, I've not seen what it looks like ... Please design the whole dashboard thing and let me see." (15 Nov 2026).
Covers: staff screens, front end only, shown to the owner before the backend build. Does not cover: any real server call.
Stand on ADM-A (merged): the shell and nav (app/admin/layout.tsx), the shared parts (components/admin/ui.tsx: use them, add a prop if one
is short, never fork or restyle them), the seam (lib/admin-api.ts: each function names its /v1/admin request and returns marked sample
data), fixtures and types. Three other builders add sections at the same time: in the shared files (lib/admin-api.ts, lib/admin-fixtures.ts,
lib/admin-types.ts, styles/admin.css, the nav list) only ADD, each addition in one block headed `/* ADM-C */` at the END of the file; put
what you can in your own files (lib/admin/c-*.ts, components/admin/c/**) and re-export. Class prefix fo-. Numbers that exist in
lib/catalog.ts, lib/pro-data.ts, lib/studio.ts, lib/levels.ts are read from there, never retyped.
For anything unclear pick the safest default, write "Default (lead), owner may override" in ADM.md's Current state and go on. Ask nobody.

Cases (input -> expected):
  C1: /admin/payments: every payment (what for, Paystack reference, state), find by reference, phone or wish number; refund with a
      reason; a ledger view: our ledger beside the provider's total for a day, any difference shown and listed.
  C2: /admin/businesses: plan, wishes used and rolled over, Vault space used and billed, logins, invoices; open one -> its detail.
  C3: /admin/concierge: orders (single or a list of names); assign a maker; names and dates; deliveries due this week; the opened report.
  C4: /admin/prices: tickets, extras, keeps, the Pass, Pro plans, wish pack, Vault space, Studio plans and credits, and the date the 40%
      off ends; edit one -> the confirm sheet shows old and new, takes a reason, and the change is listed below as it will be in the audit log.
Files (touch nothing else): app/admin/payments/**, app/admin/businesses/**, app/admin/concierge/**, app/admin/prices/**, components/admin/c/**, lib/admin/c-*.ts, and the additive blocks named above.
Out of scope: other bundles' sections; any file outside the list (need a shared change? say so in the hand-back).
Not built means not drawn: no do-nothing button, no placeholder row. Every action opens the confirm sheet, takes a reason, and the row
shows the new state (in memory, through the seam). An invented number is PROVISIONAL (sample data is marked as sample).

Work: local branch `adm-c` from claude/sleepy-mayer-f0hkb8; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-adm-c-web; dev server port 3531 (NEXT_DIST=.next-admc).
Checks (quiet logs, gate on the EXIT line): `npx tsc --noEmit`; `node scripts/check-css.mjs`; a Playwright walk of your cases at 360 x 740,
390 x 844 and 1440 x 900, light and dark: no sideways page scroll, zero console errors; pictures of each screen and each drawn state at
390 and 1440 in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/adm-c/ (look at them yourself, fix what is broken). Then /app and /app/pro by client-side moves after /admin: unchanged.
Update ADM.md's Current state (your lines only). Commit (do not push). Hand back in 10 lines: head sha; per task done or partial with its
proof; CLAIMS one per line, testable by someone who has not read the code; what did not run and why; EXIT lines.
