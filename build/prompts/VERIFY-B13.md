VERIFIER B13 | TIER T1 lean (plus the ban at sign-in) | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B13.md (the cases are the contract),
rulings QQ1-QQ6 in build/rulings-phase3.md.
Under test: local branch `b13-showing-moderation` (head ade50c7) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b13 (detached at the branch; `npm ci`); ports 4760-4769; TEST_DB_PREFIX=vb13 for every run; a clock in the
year 2182 for your own cases; remove both when done; kill by PID.
Known and NOT findings (QQ1-QQ6): E-133 takes an optional code outside the registry; no route lifts a ban; the wish detail
does not carry `publish`; the lifecycle does not call dropForWishes; one staff list with a `queue` field; raw-SQL tables.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b13/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - Privacy of the public list: read every field of E-140 and of one public wish: no account id, email, phone, receiver name
   beyond what the owner chose to show, no passcode, no file key that opens without the link. A wish with a passcode or a
   wish not yet at its time must never be listed (HIGH if it is).
 - Leaving the list: rest, take down, remove, erase the owner, ban the owner: after each, E-140 and a direct read by its
   public id show nothing, in the same request cycle (no cache window; say if there is one).
 - Someone else's: ask to publish another account's wish; unpublish another's; a draft; a wish made for a business client.
 - Reports: 11 from one address in a day (the 11th refused), 30 at once with 3 left (exactly 3); a report on a wish that is
   not listed; "this is me" with 6 wrong codes then the right one; the code of one report used on another; 50 code asks at
   once for one wish (how many emails go out: say).
 - Decisions: two staff at once; decide twice; uphold then dismiss; a take-down of a wish already resting; the third upheld
   report bans exactly once under 5 decisions at once.
 - The ban at sign-in: a banned account's live access token on a write, its refresh, a new code sign-in, a Google sign-in:
   each refused, with the registry's error shape; a banned account must still be able to read what it paid for if the brief
   says so (say what happens); an account that is not banned is not slowed (one extra query at most per sign-in: read the code).
 - Staff: every staff role on each staff route against the registry; no token; a user token.
 - Errors: the envelope; no 500 for a non-uuid id, a bad cursor, a NUL byte, a date in the past or 7 days out for E-49.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/showing src/modules/moderation src/modules/sessions` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b13/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
