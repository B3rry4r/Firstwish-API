PATCH P-WEB-API-7 round 1 | TIER T2 (uploads, a payment return) | Budget 80 steps. Close F1-F8 from the check of the Studio files bundle; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed finding; NEVER commit
tsconfig.json (the built stack changes it: restore it before each commit); stop only PIDs you started; final
suites in the FOREGROUND; hand back once with nothing left running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, WEB-API-7.md and WEB-API-7B.md (same folder; their file map is yours,
plus components/app/life/PayStart.tsx for F5 and components/app/Switcher.tsx for F7), rulings II2, II5, IF1 in
/home/user/Firstwish-API/build/rulings-phase3.md, and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-7/VERDICT.md (probes and pictures beside it).
Work: branch `web-api-7` (a1c99b6) of /home/user/Firstwish-web in a new worktree .../build/wt/web-api-7 (`npm ci`). FIRST bring the work
head in: `git merge --no-ff claude/sleepy-mayer-f0hkb8` (the head in your spawn line; scripts/live/drive.mjs: keep both sides,
`node --check`; the contract file: the head's). API worktree .../build/wt/web-api-7-api detached at the API commit
in your spawn line; `API_DIR=<it> npm run contracts:check` must exit 0 (if not: contracts:sync, commit the
contract file). Ports 5660-5679; stack prefix wa7; the stack BUILT.
 F1 HIGH components/app/studio/AddPanel.tsx:170: a file still being checked can be placed. Place is offered only
    for a file that is ready; a held or refused file cannot be placed, dragged in or chosen as poster, sound,
    backdrop or fill anywhere in the editor. If the server refuses a save for a named file (II5: 422 naming the
    place), the editor says the server's words and draws nothing it did not save.
 F2 HIGH components/app/studio/Files.tsx:26: leaving the editor mid-upload lets the put finish and leaves a ready
    file nothing lists. Leaving stops the upload (the put is aborted and its ticket dropped) or, where it has
    already finished, the file is on the Artwork shelf when the creator comes back (the shelf lists what the
    server holds for the style, E-267, not what this visit added). Prove both in wa7.mjs.
 F3 MEDIUM AddPanel.tsx:158,198: Delete drops the tile without the server's answer. The tile goes only when the
    server says it is gone; a failure says so in words with the tile still there.
 F4 MEDIUM components/app/life/PayStart.tsx:59: the Studio screen reached with ?reference= (the provider's
    return, another person's reference, an unknown one) says nothing. It reads that reference from the server and
    says paid, pending, failed or "No such payment." on the screen, as the Pass and Plan pages do.
 F5 A refused file's tile says the server's `reason` (II2; the contract has it now), not a fixed sentence.
 F6 LOW the Creator home draws no loading words while its read is held: the designed loading state; and its error
    state with a way to try again.
 F7 components/app/Switcher.tsx polls GET /me every 20 s in creator space (added by this branch outside its file
    map): no timer; the picture is read when the profile changes and when the window gets focus.
 F8 LOW components/admin/c/Prices.tsx:37,89: negative, 0, a decimal and letters are answered by local words; send
    them and say the server's words for the field (keep only "nothing typed" local); MB fields say MB.
The first check's whole driver was never completed: run it ONCE on a fresh stack to the end. Known on the head
and not yours: p-w5 "L1", w5-maker2 "styles on screen" (another branch fixes them). `W11 a role change is saved`
failed in the checker's run: run w11 alone twice and say whether this branch causes it. Any other FAIL: rerun
that flow alone and report both. wa7.mjs alone: 0 FAIL twice.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check,
build; measure the screens you touched at 360, 390, 1440, light and dark. Commit; do not push; do not edit
.pipeline-ui/wired.json, scripts/gates/** or a baseline; stack down, databases and worktrees removed. Hand back
ONCE in 12 lines: head; F1-F8 with file:line and the proof; wa7's two totals, w11's, the driver's; every edit
outside the file map.
