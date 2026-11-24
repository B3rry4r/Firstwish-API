BUILDER R3C | TIER T2 small (the stand-in's hold; one number) | Budget 35 steps. Two small changes; nothing else.
ONE heavy job at a time; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...` with `--maxWorkers=2`, in the FOREGROUND, only
when `free -g` shows 6 GB or more; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or
/home/user/Firstwish-web themselves.
Read /home/user/Firstwish-API/build/common-rules.md; rulings IK6a, IK7, IK7a (the END of /home/user/Firstwish-API/build/rulings-phase3.md); src/modules/render-jobs/video-renderer.ts (the
stand-in's hold), src/common/env/env.ts and env.schema.ts (STANDIN_VIDEO, STANDIN_RENDER_TOKENS), render-jobs.service.ts (:18-22 SPEC).
Work: /home/user/Firstwish-API, local branch `r3c` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/r3c (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=r3c. Do not edit a gate or a baseline; no
registry reopen; a test changes only where a case below makes its expectation wrong (name each).
Why: with STANDIN_VIDEO=hold set for a whole test stack, every OTHER flow's video stayed "being made" for up to 120
seconds (the wish page's flow failed). And the status video's 30 seconds was a guess that cuts wishes off.
 1. IK7a: a new name STANDIN_RENDER_HOLD_FILE=<path> (allowed and refused at boot exactly as STANDIN_RENDER_TOKENS).
    With STANDIN_VIDEO=hold AND that name set, a render holds ONLY IF the file exists at the moment the render
    starts; with no file there the render is made at once (as with no hold). With STANDIN_VIDEO=hold and the name
    NOT set, it holds as today (R3B's tests stay true). In env.schema.ts and .pipeline/env-manifest.json, test stacks only.
    Tests: file present: holds until the token is read; file absent: done at once; removed mid-hold: the running
    hold still ends by the read, the abort or the cap.
 2. IK6a: a status video's `seconds` is 60 (was 30); the keepsake stays 60. Find every place and test that says 30
    for it (the SPEC, the stand-in's file mark, the wish read, the contract's notes): change them and name each.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
render-jobs and env folders' specs; do NOT run the full suite (the lead's merge check runs it). Commit on r3c; do not
push; remove your worktree. Hand back ONCE in 6 lines.
