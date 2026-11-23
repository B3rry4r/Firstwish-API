PATCH P-WEB-API-7 round 2 (the last) | TIER T2 | Budget 40 steps. ONE finding from the re-check; change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; stop only PIDs you started; hand back once, nothing running.
Read /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-7/VERDICT2.md (finding 1) and /home/user/Firstwish-API/build/prompts/P6-COMMON.md (the stack).
Work: branch `web-api-7` (cb73f69) of /home/user/Firstwish-web in a new worktree .../build/wt/web-api-7 (`npm ci`); API worktree
.../build/wt/web-api-7-api detached at the API commit in your spawn line (it holds the server's fourteenth round);
`API_DIR=<it> npm run contracts:check` (if it differs: `git merge --no-ff claude/sleepy-mayer-f0hkb8`, then check again). Ports
5660-5679; stack prefix wa7; BUILT. You own lib/studio-api.ts, components/app/studio/** and
scripts/live/flows/wa7.mjs.
 K1 HIGH lib/studio-api.ts:418 (removeStyleFile): since the server's fourteenth round, deleting a file that the
    draft names makes the SERVER take that name out of the draft and raise the style's version
    (src/modules/stored-files/stored-files.service.ts:281 in the API worktree). The editor keeps its old version,
    so its next honest save is 409 stale_version and the "Saved somewhere else" sheet opens and blocks the screen
    (seen on the real server: PATCH 409 right after DELETE; 7 wa7 checks fail from it). After a Delete the server
    says is done, the editor takes the server's document and version (from the answer if it carries them, else
    one read of the style) before any save of its own: no 409, no sheet, the deleted file's uses gone from the
    layers exactly as the server took them out, nothing else the creator typed lost (an edit made while the
    Delete was in flight is kept and saved on the new version). A real save from another device still opens the
    sheet as before.
Proof: wa7.mjs alone on a FRESH stack against this API: 0 FAIL, twice (it was 82 PASS, 7 FAIL); add one wa7 check
that deletes a placed file and then saves a change with no 409. w10.mjs alone: 0 FAIL. Checks (quiet logs, EXIT
lines): typecheck, lint on changed files, gates, test:client, contracts:check, build. Commit; do not push; stack
down, databases and worktrees removed. Hand back ONCE in 6 lines: head; K1 with file:line; `git diff --stat
cb73f69` for your own commits; the three flow totals; the EXIT lines.
