VERIFIER B03 | TIER T2 full | Budget 90 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B03.md (the cases are the contract),
.pipeline/conventions.md (auth model, error envelope), rulings A1, A6, A8, A14, Q9 in build/rulings-phase3.md.
Under test: local branch `b03-staff-audit` (head c3fc01e) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 (7ce487b). Your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b03 (detached at the branch; `npm ci`); ports 4160-4169; database prefix vb03; remove both when done; kill by
PID. PostgreSQL and Redis are up. Endpoints: `python3 tools/pipeline/show.py endpoint E-174` ... E-181 and E-18.
Run the stack (`scripts/stack.sh up vb03 4160`) and attack by real HTTP (curl or a node script). Known and NOT a finding (the builder
halted on it; the lead is fixing it): on a real stack every staff token gets 401 because the kernel's token verifier refuses all;
to attack routes behind sign-in, wire the composite verifier the way the builder's tests do (test kit `configure`) in a throwaway
script, or attack through createTestApp. Also known: audit has no section or reason column yet; no staff refresh route; "removed" is stored as suspended.
CLAIMS: take each line under "Claims" in the builder's hand-back (copied to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b03/CLAIMS.md) and say PASS or FAIL with what you saw.
Attacks (say what happened for each):
 - Enumeration: timing and body of POST code for a staff email, a stranger, a suspended member (same status, same body; is the
   time difference visible: measure 20 each); does the limiter reveal who is staff (429 only for real staff)?
 - Codes: brute force (5 tries then dead, also when the 6 tries are sent at once in parallel: at most 5 are checked); a used code
   again; an expired code (move the clock port); two verifies of the right code at the same moment make ONE session; the code is
   stored hashed (look in the table); a code for one email cannot verify another.
 - Redis down: the builder says the rate check is skipped. Stop your own Redis-side by pointing the stack at a dead port: do codes
   still send without any limit? (An open door when Redis is down is HIGH for a staff sign-in.)
 - Tokens: a user-audience token on staff routes and the reverse; alg none; a token signed with the wrong key; an expired token; a
   token for a removed or suspended member (must die at once, not at expiry); role changed while a token is live (takes effect at once?).
 - Cookie: HttpOnly, Secure, SameSite, Path; not readable or sendable to non-auth paths; sign-out really kills the session row.
 - Roles: every route with each of the 7 roles (table of status codes against the registry's roles); a member with no roles.
 - Last owner: demote, suspend, remove, and two owners removing each other at the same moment (must leave one owner).
 - Invite: owner role refused; duplicate in another case (Ada@x.com); invite then remove then invite again; an invited member's code flow.
 - Audit: a changing request with reason "abc" writes nothing and changes nothing; a failing change leaves no row; exactly one row
   per change under 20 parallel changes; rows carry no email, name or code (grep the rows you made); UPDATE and DELETE refused;
   the address is cut; changedFields holds names only.
 - Errors: every failure is the envelope with a requestId; no stack, SQL or Prisma text; unknown body fields 422.
 - Code: grep src/modules of the diff for Date.now(), new Date() outside the clock port, parseFloat, console.log, TODO, "out of scope".
Checks: build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules` (EXIT lines, quiet logs).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b03/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
