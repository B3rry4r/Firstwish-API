VERIFIER B14 | TIER T1 lean (plus the parallel cases) | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B14.md (the cases are the contract).
Under test: local branch `b14-styles` (head 707d8a8) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 (f0be0ad). Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b14 (detached at the branch; `npm ci`); ports 4260-4269; database prefix vb14; remove both when done; kill by PID.
Endpoints: E-52, E-193..E-199, E-212 (`python3 tools/pipeline/show.py endpoint E-193`). Run the stack (`scripts/stack.sh up vb14 4260`,
then the seed) and test over real HTTP with your own scripts; staff sign-in on the stack: STAFF_BOOTSTRAP_OWNER_EMAIL and the
stand-in code generator (README says how the stand-in gives codes).
Known and NOT findings (the builder halted; rulings X1-X4 in build/rulings-phase3.md): Style.rate may be null; the level filter is a
local DTO; StyleRate's wider shape; the event key lives in props.key.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b14/CLAIMS.md: PASS or FAIL with what you saw.
Attacks: the 43 seeded levels equal the web app's (compare with /home/user/Firstwish-web/lib/styles.ts or the manifests: list any
difference); 10 moves of one style at once: one 200, the rest 409, one audit row, one history row; a move with reason "abc" changes
nothing; each of the 7 staff roles on each staff route against the registry; a user token and no token; switch off then the public
reads; ETag: unchanged data gives 304, a move gives a new ETag; events: the same key 20 times at once is one row; "paid" from the
app is refused; an event for an unknown slug; the same key from two different accounts counts twice; a quarter with 199 and with
200 previews (insert rows directly): null then a number; quarter "2026-q5", "abc": 422; slug " Golden " matches golden? (say);
an off or unknown slug 404; cursor paging returns every style once across pages (no repeat, no gap) with and without the level filter.
Errors are the envelope; no 500 anywhere you tried (a bad cursor, a bad uuid, a huge body).
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules/styles src/modules/events src/modules/templates` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b14/VERDICT.md (40 lines or fewer). Hand back in 15 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
