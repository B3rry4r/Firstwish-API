VERIFIER B01 | TIER T2 full | Budget 95 steps. You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B01.md (the cases are the contract),
.pipeline/conventions.md (auth model, error envelope, format canon), owner rulings R10 and R11 in build/rulings.md.
Under test: local branch `b01-sign-in` (head 085b266) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 (7ce487b). Your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b01 (detached at the branch; `npm ci`); ports 4170-4179; database prefix vb01; remove both when done; kill by
PID. PostgreSQL and Redis are up. Endpoints: E-19, E-20, E-159..E-162, E-6, E-7, E-53..E-56 (`python3 tools/pipeline/show.py endpoint E-19`).
Known and NOT a finding (the builder halted on them; the lead is fixing them): on a real stack every signed-in route answers 401 until
the kernel binds the JWT verifier (apply the two-line change the builder describes in src/common/common.module.ts in YOUR worktree
only, to attack by real HTTP); the registry's response shape for E-20, E-159, E-53, E-54; E-159 is public by its cookie.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b01/CLAIMS.md: PASS or FAIL with what you saw. Run the stack (`scripts/stack.sh up vb01 4170`) and
attack by real HTTP (curl or a node script); the email stand-in's captured mail gives you the codes.
Attacks (say what happened for each):
 - Enumeration: status, body and timing of asking a code for an email with and without an account (20 each); does any limiter or
   error reveal an account exists?
 - Codes: 6 wrong tries sent in parallel (at most 5 checked, then dead); the right code after the 5th wrong try; a used code; an
   expired code (clock port); a code for ada@ verifying as bob@; the code compared in constant time; stored hashed; a second code
   request kills or keeps the first (say which, and whether two live codes double the tries).
 - Limits: can 429s be dodged by changing case, adding dots or +tags to the email, or by X-Forwarded-For (which header is trusted
   for the IP, and can a caller forge it)? What happens to the limits and the Google state when Redis is down (an open door is HIGH)?
 - Tokens: alg none; a wrong-key signature; an expired token; a token after sign-out (dies at once?); a staff-kind token on user
   routes; tampered claims; where the signing secret comes from and its minimum length at boot.
 - Refresh: cookie flags and path; a rotated token reused (family ends; other devices live); two refreshes with the same token at
   the same moment (one wins, or both die: never two live children); refresh needs no bearer; a refresh request from another origin
   (CORS: which origins may send credentials? a wildcard with credentials is HIGH); is there any CSRF guard on cookie routes?
 - Account: one account per email under 10 parallel first sign-ins; an erased account's email signing in again (what happens?).
 - Google: state reused, missing, from another browser; a token for another audience; an email not verified; a Google email equal
   to an existing account in another case; link while signed in as another account; unlink the only way to sign in (is the account
   locked out? it must still have the email code).
 - /v1/me: PATCH with sides, email, id, role, erasedAt, mode "blue", a 10,000 character name, a handle with capitals, a reserved
   handle ("admin"), a taken handle in another case; another user's data never returned by any route (owner checks in the query).
 - R11: nothing sends an SMS or a WhatsApp; a phone is never verified and never a key. R10: nothing asks the page to keep a token
   (the body's access token is the only one; the refresh token is never in a body).
 - Errors: every failure is the envelope with a requestId; no stack, SQL or Prisma text; unknown body fields 422.
 - Code: grep the diff's src for Date.now(), new Date( outside the clock port, Math.random( for anything secret, console.log, TODO.
Checks: build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules` twice (EXIT lines, quiet logs; a
spec that passes once and fails once is a finding).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b01/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
