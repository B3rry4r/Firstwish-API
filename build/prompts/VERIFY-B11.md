VERIFIER B11 | TIER T1 lean (plus the parallel and privacy cases) | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B11.md (the cases are the contract),
owner rulings R8, R11, R12 in build/rulings.md, rulings II1-II6 in build/rulings-phase3.md.
Under test: local branch `b11-notices` (head bd86fa6) of /home/user/Firstwish-API; base local branch int-3 (5c066c0). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b11 (detached at the branch; `npm ci`); ports 4580-4589; TEST_DB_PREFIX=vb11 for every run; remove both when done; kill by PID.
Endpoints: E-70, E-71, E-75..E-78. Use your OWN script on createTestApp with the clock port and the email stand-in (and a fake
fetch for the Resend adapter: never the real host). Known and NOT findings (II1-II6): no email webhook; E-75/E-76 answer the
Notice shape; an advisory lock in place of a unique index; the wish's zone for 09:00; identity does not call it yet.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b11/CLAIMS.md: PASS or FAIL with what you saw.
Attacks: read every seeded message as a customer would (print them): plain short words, no emoji, none of the banned words, says
"kind" never format/category/type, no SMS or WhatsApp wording, no hole where a placeholder should be, no sender's email in a
message to someone else; a staff edit that adds an emoji, a banned word, an unknown placeholder, a script tag, or 20,000
characters: refused or made safe (say what an HTML tag in the wording does in the sent email: escaped?); a value with HTML or a
header-injection newline in {name} or the subject: the email's subject and body stay one message (a second header injected is
HIGH); 30 sends with one key at once: one email; the same key with different data: still one, the first; a retry storm: a
provider that fails 50 times in a row sends at most 3 per delivery; "send again" 10 at once: one; every staff role on each
staff route against the registry; a user token: 403; the delivery log never shows a full address or a sign-in code (search the
JSON for an @ and for the code); the database: is the sign-in code stored anywhere readable after delivery (search)? an erased
account: its queued deliveries are dropped and its address is gone from message_delivery (search the table).
The clock: resting soon is queued for 09:00 in the wish's zone three days before endsAt for Lagos, Los Angeles and Tokyo wishes
(print the instants); a keep bought between scheduling and 09:00 cancels it.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/notices` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b11/VERDICT.md (40 lines or fewer). Hand back in 15 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what was NOT RUN against real Resend.
