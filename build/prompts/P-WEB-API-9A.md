PATCH P-WEB-API-9A round 1 | TIER T2 (money starts, a client's marks) | Budget 60 steps. Close F1, F2, F3 only.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed item; stop only PIDs you
started; run final suites in the FOREGROUND and hand back once, with nothing left running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, your first brief (WEB-API-9A.md, same folder) and the verifier's file
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-9a/VERDICT.md (and pics/ beside it).
Work: branch `web-api-9a` (e2e1214) of /home/user/Firstwish-web in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-api-9a (`npm ci`). FIRST bring the work head in:
`git merge --no-ff claude/sleepy-mayer-f0hkb8` (d99117c; scripts/live/drive.mjs: keep both sides, `node --check`;
the contract file: the head's). API worktree .../build/wt/web-api-9a-api detached at 01e1dff; `npm run
contracts:check` against it must exit 0. Ports 5620-5639; stack prefix wa9a; the stack BUILT.
You own what the first brief gave you, PLUS for this patch: the hearts drawing inside the style engine where a
frame's heart is drawn, the start call only in app/app/pass/page.tsx and the extra's start call only in
app/app/wishes/[id]/page.tsx. NOT yours: components/app/studio/**, lib/studio-api.ts (another agent is in them).
 F1 HIGH components/app/pro/RevealPlay.tsx: `held` starts empty and the server's hearts are never read. The page
    draws the hearts the server holds (GET /r/:code `hearts`, by file) on first load, after a reload and on a
    second device; a tap on a held heart UNMARKS it (sends marked:false); after any mark the drawn set is the
    server's answer. Proof in wa9a.mjs: mark 2 of 4, reload: the same 2 pressed; a second browser context with the
    code: the same 2; tap one: the server holds 1; the business's Favourites shows the same.
 F2 MEDIUM returnPath (IF1) is not sent by the pass start (app/app/pass/page.tsx:103) or the portrait-video extra
    (app/app/wishes/[id]/page.tsx:145). Send the screen's own path; with the stand-in the person comes back to that
    screen and the result is read there (paid, pending, failed). Proof in wa9a.mjs: both returns driven in the
    browser. (The Studio and Concierge buys are the other agent's: leave them.)
 F3 MEDIUM wa9a.mjs is not green alone: at "1 attacks" the /r page is back at the opening (WATCH) with no Frame
    buttons (the verifier's fail picture). PIN THE CAUSE and say it. If a re-read (focus, after a mark, a 429)
    restarts playback or drops the person's place, that is a screen bug: fix it (a refusal is said in the server's
    words and the person stays where they were). If it is the flow's own burst, give the flow its own addresses
    (uniqueAddress) or pace it; never raise or switch off a limit. Proof: wa9a.mjs alone on a FRESH stack, 0 FAIL,
    three runs in a row.
Then the whole driver ONCE on a fresh stack. Known on the head and NOT yours: p-w5 "L1 an empty moment list" and
w5-maker2 "styles on screen" (a flow fix is queued); any other FAIL: rerun that flow alone and report both.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check,
build; measure /r/<code> with hearts held at 360, 390 and 1440, light and dark; one light/dark picture pair.
Commit; do not push; do not edit .pipeline-ui/wired.json, scripts/gates/** or a baseline; remove YOUR worktrees,
stack and databases. Hand back ONCE in 10 lines: head; F1, F2, F3 with file:line and the proof (F3: the cause);
the flow's three totals and the driver's total; `git diff --stat` against e2e1214 for your own commits.
