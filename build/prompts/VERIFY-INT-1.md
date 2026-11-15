VERIFIER INT-1 | TIER T2, re-check by ruling id | Budget 80 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/INT-1.md, and in build/rulings-phase3.md the sections S1-S6,
T1-T6, U1-U8, V1-V9 (four sections, "From B03's halts" to "From Verify B01"), then /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b03/VERDICT.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b01/VERDICT.md.
Under test: local branch `int-1` (head 5ad467b) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-int-1 (detached at int-1; `npm ci`); ports 4190-4199; database prefix vint1; remove both when done; kill by PID.
Run the stack (`scripts/stack.sh up vint1 4190`) and attack over real HTTP with your OWN scripts (never the builder's spec as proof).
For EACH ruling id say CLOSED or OPEN with what you ran and saw. The ones that must be proved by attack, not by reading:
 U1: 10 wrong + 1 right code truly at once, user AND staff sign-in, 15 runs each: the right code never gets in after 5 tries are spent.
 U2: with Redis unreachable (point the stack at a dead port), ask 30 codes for one email (user and staff): the limit holds; wrong
     tries across several codes for one email stop at the cap; with the database unreachable the answer is 503, not a pass.
 U4: timing of asking a code, staff vs stranger and account vs none, 30 each: medians within 2 ms.
 V1: sign in, take the access token, refresh, use the OLD access token: 200. Sign out: the old token dies at once.
 V2: 6 refreshes at once with one cookie: 6 x 200 and exactly one live child; the same after 11 s: the family ends, 401, and other
     devices of the account still work. A losing or late reply never clears a good cookie. Same for the staff refresh (S5).
 V3: finish a Google callback from a client without the nonce cookie, and with another browser's cookie: refused.
 V4: with TRUST_PROXY_HOPS=0 a forged X-Forwarded-For does not dodge the per-address limit; with 1 it reads one hop.
 S1/T5: user token on every staff route and staff token on every user route (403); alg none, wrong key, expired, wrong audience (401).
 S3/U5: remove a member: token dies, cannot sign in, shows as removed; invite again: back as invited with the new role; one audit row each.
 S2/S4: audit rows have section and reason; the section filter works; finance is refused; reason 3 and 501 characters refused (U6).
 U3: 10 parallel invites of one email: one 201, nine 409, no 500. U7: DELETE of a staff_account row in psql is refused.
 T1/T2/T3: verify, Google callback and refresh answer AuthResult with no refresh token and no hash in any body; start answers {url}.
Also: W2 (not yet built; report only): do the cookie-only routes check the Origin header? CSRF: can a cross-origin page make the
refresh happen (what do SameSite and CORS do in your test)?
New things: anything high or blocker you meet (a way to sign in without the code, to read another account, to act as staff).
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, registry sha equals the lock, migrate deploy on a
fresh database and migrate diff no drift, seed twice, `npm run test:affected -- src/modules src/common test` twice (a flake is a finding).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/int-1/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings by severity; what you did not run and why.
