VERIFIER R5 re-check (ruling IK6h (a)) | TIER T2 (the real video recorder) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 5 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...` with
`--maxWorkers=2` and TEST_DB_PREFIX=v3r5 on EVERY test command; never pkill, killall or pgrep -f (stop only PIDs you started, Chromium and ffmpeg children
too); never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves; no command over 8 minutes; no `rm -rf`
in a loop. S=/tmp/claude-0/-home-user/eafa830a-41bc-56b4-853f-17665575469b/scratchpad. Notes as you go to $S/build/verify/r5/NOTES3.md.
Read /home/user/Firstwish-API/build/common-rules.md; /home/user/Firstwish-API/build/handover/verdicts/r5-VERDICT.md (rounds 1 and 2; the old probes are
LOST: write your own small ones); /home/user/Firstwish-API/build/prompts/P2-R5.md (the round's cases); rulings IK6g, IK6h (END of build/rulings-phase3.md).
Under test: the local branch `r5` (head e5a56ad = the old 725d21c, re-applied from a patch) MERGED onto ccr-91b3ed11-fx445c: make it in your own
worktree $S/build/wt/v3-r5 (`git worktree add --detach <path> ccr-91b3ed11-fx445c`, `git merge --no-commit r5`; commit nothing), `npm ci`,
`npx prisma generate`. A web worktree $S/build/wt/v3-r5-web at web ccr-91b3ed11-fx445c (`npm ci`, `next build`, `next start`; read only), only if a
case needs a real page; a stand-in page of your own is enough for most. Ports 5400-5419. Chromium /opt/pw-browsers/chromium; ffmpeg, ffprobe in /usr/bin.
The claims of round 2 (test only these; IK6h moved the rest to other tasks):
 H2 the browser is driven over --remote-debugging-pipe: during a render `ss -ltnp` shows no port of Chromium's; a curl sweep of every local listening
    port finds the token nowhere (/json/list, /json/version on each).
 H3 SIGKILL of the node process mid-render: within 5 s no Chromium, no ffmpeg, no proxy port, no listening port of theirs is left (start the adapter in
    a child node process and kill -9 it; list processes and ports before and after).
 M4 a picture or a font that never completes fails the render with plain words inside assetTimeoutMs (30 s); a picture slowed 3 s and 10 s IS in the frames.
 M5 the proxy asks for a per-render secret: during a render another local process gets 407 for a listed host and an unlisted one; the secret is on no
    command line (ps) and in no log; an https CONNECT with the browser's own path works (the render that needs it succeeds).
 L  plain words for a killed ffmpeg (no "write EPIPE") and a killed Chromium (no "Target page ... closed"); blocked count leaves out Chromium's own calls.
Also, once each: a ws to another port of the same host gets nothing (round 1's HIGH); an abort at ~330 ms rejects in under 2 s (5 tries).
Checks (quiet logs, EXIT lines): typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the render-jobs folder
TWICE. Do NOT run the full suite (a refused command: do not retry, ask nobody, say NOT RUN).
Write $S/build/verify/r5/VERDICT3.md (25 lines or fewer): MERGE or FIX FIRST, findings by severity with file:line and the numbers seen, then what was NOT
run. Stop what you started by PID; remove your worktrees and recordings; drop your databases. Hand back ONCE in 14 lines.
