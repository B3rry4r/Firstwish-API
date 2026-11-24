VERIFIER R3B | TIER T2, short (a stand-in that writes a secret to a file) | Budget 35 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, tests ONLY through `npm test -- ...` or `npm run test:affected -- ...` with `--maxWorkers=2` (never `npx jest`); never pkill,
killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r3b/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/R3B.md (its cases are the contract) and ruling IK7 (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Under test: /home/user/Firstwish-API local branch `r3b` (head a1d9526) against its base bbe7405. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-r3b (`npm ci`, `npx prisma generate`); ports 5210-5219; TEST_DB_PREFIX=vr3b.
The builder's claims: STANDIN_RENDER_TOKENS=<file> makes the stand-in renderer append one JSON line {jobId, wishId,
kind, width, height, seconds, token} a render at mode 0600; unset writes nothing; the server refuses to boot with it
(and with STANDIN_VIDEO=hold) under live providers or NODE_ENV=production, with words. STANDIN_VIDEO=hold waits after
the line until the job's tokenUsedAt is set, the abort, or RENDER_STANDIN_HOLD_SECONDS (default 120); while it
holds the read with that token is 200 once; the job then ends done; an abort during the hold ends at once with no
file; after the job ends the token answers 404. Both names in env.schema.ts and env-manifest.json as test stacks
only. The real binding's configured() stays false. Full run 215 suites passed.
Attack (each PASS or FAIL with what you saw; a token written anywhere under live providers or production is a BLOCKER):
 1. Boot: every mix of PROVIDERS (standin, live), NODE_ENV (production, development, test, unset) and the three
    names (STANDIN_RENDER_TOKENS, STANDIN_VIDEO=hold, RENDER_STANDIN_HOLD_SECONDS) set and unset: which boot, which
    refuse, and the words; PROVIDERS=live with STANDIN_RENDER_TOKENS set but empty; a typo'd value; can anything
    make the LIVE binding (or NoVideoRenderer) write a token line: read videoRendererFor and try it.
 2. The file: its mode when created (0600) and when it ALREADY exists with 0644 (is it tightened or refused?); a
    path that is a directory, unwritable, or a symlink to somewhere else: what happens to the render (a failed
    write must not print the token to a log: capture the logger and stderr); two renders at once: two whole lines.
 3. The token appears nowhere but that file and the row's hash: logs, the job payload, audit rows, notices, error
    bodies, across a held run and an aborted one.
 4. Hold: the read 200 once then the job done and the wish read "ready"; abort by the time limit and by an erase
    during the hold: no file row, no storage object; the cap (set RENDER_STANDIN_HOLD_SECONDS=2): the job ends done
    without a read and the token is dead; with hold and NO token file: still holds, nothing written.
 5. Nothing else changed: the render-jobs and env folders' specs; the round 19 spec (nothing that includes the
    video sells with the live binding); typecheck; the WHOLE lint; scripts/gates.sh; check-contracts, check-drift,
    check-routes. Do NOT run the full suite (the lead's merge check runs it).
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r3b/VERDICT.md (25 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line. Drop your databases, remove your worktree. Hand back ONCE in 10 lines.
