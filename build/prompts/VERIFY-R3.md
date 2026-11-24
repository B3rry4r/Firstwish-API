VERIFIER R3 | TIER T2 (a secret read of a wish: the render token), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r3/NOTES.md (if it exists an earlier verifier was lost: read it, carry on).
Work ONLY in your own worktree: never edit, build, checkout or reset anything in /home/user/Firstwish-API itself.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/R3.md (its cases are the contract), sections 2, 3, 8 of /home/user/Firstwish-API/build/tasks/RENDERER-PLAN.md,
rulings IK4a, IK6, Q8, HP3 (in /home/user/Firstwish-API/build/rulings-phase3.md).
Under test: /home/user/Firstwish-API local branch `r3` (head a474537) against its base 04c964e. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r3 (`npm ci`, `npx prisma generate`); ports 5210-5219; TEST_DB_PREFIX=vr3. Probes as specs under the
verify folder, through the real routes.
The builder's claims: a token (32 random bytes, HMAC stored as render_job.tokenHash with tokenExpiresAt and
tokenUsedAt; 900 s; one use) is made when a render run starts, lives only in memory (RenderRequest.token), is
cleared when the run ends; no route mints one; it is in no payload, log, audit row or notice (the 5xx log line
masks /v1/render/:token). GET /v1/render/:token/wish (E-289, no session) answers {kind, seconds, width, height,
wish: the public view with the opening passed and content without secrets, style: {style, items, document}}, files
signed for the render's time limit + 600 s, no-store; a passcode or question wish gives its content, never the
secret or its hash. The second read 410; expired 410; unknown, malformed or wrong 404 with the same words; a token
reads only its own wish; two reads at once: one wins; an ended job: 404 or 410. Erased or refunded between mint and
read: 404. A draft, a taken-down wish, an erased account, a not-delivered wish: 404; photos still in checking or
rejected are left out as the public link does. The link's rate-limit bucket (429 + Retry-After). The term, opens,
notices, audits and openedAt are untouched. Migration 20261210090000_render_token_r3; registry DEC-326, DEC-327; no
older test changed. Full run 1679 passed on its third run (run 1: its own rate-limit test filled a shared bucket,
fixed; run 2: api-base-5-staff failed once, "a payments list page crowded by other specs' rows").
Attack (each PASS or FAIL with what you saw; a wish's content reaching anyone without a live token is a BLOCKER):
 - Guessing and timing: 200 wrong tokens: the same status, words and (within noise) time as an unknown one; the
   comparison is constant-time on the hash; the token's entropy; does a wrong token count against the right one's
   use; the rate limit: can a flood of wrong tokens from one address lock the REAL renderer's one read out (the
   worker and an attacker would not share an address: say what the limit keys on)?
 - Reach: with a live token every OTHER route (the public link, the wish read, the files, another wish's render
   read, the video download): it opens nothing but its one read; the signed file addresses it returns: what each
   can read and for how long; a passcode wish's addresses are no wider than its public ones after an unlock.
 - Life: the token after the run ends (success, failure, abort, erase, the worker lost and the job retaken: does
   the SECOND run get a NEW token and the first's die?), after the job is dead; a token minted but never read: gone
   at expiry; the clock moved by the stand-in offset.
 - Leaks: every log line, job row, audit row, notice, error body and the stand-in mail across a whole run: the
   token and the hash appear nowhere but the row's hash column; the 404 and 410 bodies say nothing of the wish.
 - What the read gives: against the public link's view after an unlock for the same wish: field by field (a
   passcode wish, a creator Studio style at the version the wish holds, a resting wish, a wish whose owner was
   erased): nothing MORE than the link gives except the passed opening; held or refused photos absent.
 - Side effects: the read changes nothing a receiver's open changes (list each table you compared before and after).
 - The contract and the migration: additive; applies on the base and fresh; check-contracts, check-drift, check-routes.
 - The flaky one: run src/modules/**/api-base-5-staff* beside the payments specs ten times with 2 workers: how many
   fail, why (which spec crowds the page), and is it this branch's doing?
Then typecheck, the WHOLE lint, scripts/gates.sh, and `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once (if
your session refuses that command, do not retry and ask nobody to run it: say NOT RUN).
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r3/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line. Drop your databases, remove your worktree. Hand back ONCE in 15 lines.
