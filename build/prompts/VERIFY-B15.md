VERIFIER B15 | TIER T2 full, credits and identity | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B15.md (the cases are the contract),
rulings XX1-XX4, WW6 in build/rulings-phase3.md, R10 and R13 in build/rulings.md.
Under test: local branch `b15-studio` (head 000caa5) of /home/user/Firstwish-API; base: local branch int-4 at e866a5c. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b15 (detached at the branch; `npm ci`); ports 4840-4849; TEST_DB_PREFIX=vb15 for every run; a clock in 2187
for your own cases; remove both when done; kill by PID.
Known and NOT findings (XX2-XX4): a request stuck waiting after a crash is not swept; a row made first by the purchases code
gets 0 credits instead of Open's 3; raw-SQL snapshot table; version inside the document; the checks job uses the kind
style-level-review; local bodies for E-186 and E-192; Anthropic never run.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b15/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - Credits (count by hand first): 20 AI asks at once with 3 credits, mixed drafts (4) and changes (1); an ask that fails, times
   out, returns rubbish: the credits come back exactly once; a give-back racing a new ask never takes the balance below zero
   or above what was bought; credits bought (a live grant) then refunded (revoked) cannot be spent; the month roll never
   mints credits; a second account can never spend the first's.
 - What reaches the AI (T-74, R13): capture the stand-in's input for a draft and a change: no customer photo address, no
   wish words, no email, no audio; the creator's instruction with a NUL byte, 100,000 characters, a prompt that asks for
   another creator's draft: refused or harmless; the answer is checked before it is saved (a document that breaks the style
   shape is 502, nothing saved).
 - Drafts: another creator's id on every route and every verb; the limit under 10 creates at once on Open (exactly 1); a
   document over the size limit (413 or 422); version races; a save after submit (the snapshot must not change: compare).
 - Submit and review: 10 submits at once of one draft (one waits, one review taken); reviews left under 10 submits of
   different drafts with 1 left; a fail gives the review back exactly once; staff accept and return at once; accept twice;
   a creator withdrawing while staff accept; an accepted style in a wish keeps working after its creator withdraws or is
   erased (T-62); only staff ever set a level (a creator's body naming a level changes nothing).
 - The eight checks (XX1): read the web app's checks function under /home/user/Firstwish-web/lib and the server's: list every rule or
   limit that differs.
 - Templates: Open opening a Premium style (402); a style whose creator said no (403); from is never taken from the body.
 - Staff: every staff role on each staff route against the registry; a user token; no token; one audit row per decision.
 - Erase: an account with drafts, a waiting submission, an accepted style, AI requests: what stays; no personal data stays.
 - The edits outside the module (StylesService, account-erasure, seed): styles and accounts specs still pass; nothing else changed.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/studio src/modules/styles src/modules/accounts src/modules/purchases` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b15/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
