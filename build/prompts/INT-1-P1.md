PATCH INT-1 round 1 | TIER T2 | Budget 35 steps. Fix only the two items below; keep the diff small; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md, /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int-1/VERDICT.md, and rulings V2 and W2 in build/rulings-phase3.md.
Branch `int-1` (head 5ad467b) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-int-1 (`npm ci`); ports 4250-4259; database prefix pint1.
 V2 (medium), users and staff: sequence O -> C (refresh), C -> D (refresh), then O sent again inside the 10 s grace answers 401 and
   clears the browser's good cookie. Fix in src/common/auth/session-families.ts:84-86 and both controllers
   (src/modules/sessions/sessions.controller.ts:54, src/modules/staff-accounts/staff-accounts.controller.ts:76): on a grace hit follow
   replacedById to the family's live head and answer with it (200, the head's cookie); and a 401 from refresh clears the cookie ONLY
   when the family is ended, never while it is alive. Tests (real database, both sign-ins): O->C, C->D, O again within grace: 200 and
   the browser ends holding a cookie that refreshes; O after the grace: family ended, 401, cookie cleared.
 W2: the routes that act on a cookie alone (user refresh and sign-out, staff refresh and sign-out, when no bearer is sent) refuse a
   request whose Origin header is present and not on the CORS allowlist: 403 in the envelope, nothing rotated. No Origin header (a
   server or curl) is allowed. One shared guard in src/common/auth. Tests: Origin https://evil.example -> 403 and the cookie still
   refreshes afterwards; an allowed Origin -> 200; no Origin -> 200.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules src/common test` twice.
Commit on `int-1` (do not push); remove your worktree and databases. Hand back in 6 lines: head sha; V2 and W2 closed with the test
names; diff size (last line of git diff --stat 5ad467b); EXIT lines.
