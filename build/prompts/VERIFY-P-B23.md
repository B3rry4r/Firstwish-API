VERIFIER P-B23 re-check | TIER T2 | Budget 28 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings GD1-GD4 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b23/VERDICT.md and its spec /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b23/vb23.attack.spec.ts.txt (reuse it).
Under test: local branch `b23-ai-writing-reads` at 71a626e against d44ef18: the diff of the two is all you check. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb23 (detached at 71a626e; `npm ci`); TEST_DB_PREFIX=vpb23; a clock in 2204; remove both when done. Do not
touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/b-b23-ai-writing-reads.
Check by id, each PASS or FAIL with what you saw:
 GD1  each route with an answer holding a NUL, a bell, an escape, a lone surrogate, and text 1 MB long: 502 (never 500), the
      row failed, the day's place back exactly once; force a failure after the provider answers (the output save): the
      same; 30 such failures at once with 3 places left: afterwards exactly 3 places are free again.
 GD2  erase one wish (through its real erase route or job): its AI requests hold no transcript and no output; another wish
      of the same account is untouched; an account erase still clears all; a removed-then-restored wish keeps its words.
 GD3  with your OWN loader of the web app's files (not the builder's web-files.ts): chapter specs 99 and every row equal,
      and the other three lists as before; seed twice is a no-op; no other seed file changed (git diff).
 GD4  E-51 answers 200 to a person with no business side, a creator, a business; 401 with no token.
 Also: Studio's AI specs pass; the first verdict's "held" list still holds (run the old spec; say what changed).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules/ai-writing
src/modules/reference-data src/modules/studio src/modules/wishes` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b23/VERDICT-P.md (20 lines or fewer). Hand back in 10 lines or fewer: merge or fix; findings by severity with file:line.
