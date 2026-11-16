VERIFIER P-W10 re-check | TIER T2 short | Budget 35 steps. Only the patch's findings F1-F3 and what the fix could break.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md (rules), the patch brief
/home/user/Firstwish-API/build/prompts/P-W10.md and the first check's /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w10-studio/VERDICT.md. Under test: /home/user/Firstwish-web local
branch `w10-studio` (head in your spawn line; the first check's head was 6747cd6). Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-w10 (web)
and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-w10-api (API at 1a96b6b); stack prefix v2w10; ports 5560-5579; verify folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w10-studio/round2/. Run every command with your own worktree as the working directory.
 1. F1: no picture upload anywhere in Studio (editor: Add panel, Element backdrop, Tools fill; New; home): count file
    inputs and every control whose words mention a picture, photo, image or artwork, and tap each one left: none is
    dead and none opens a file picker. A draft saved BEFORE the patch with an art entry (make one by the API: an
    art entry with an empty address, and one placed on a scene) opens with no empty frame, no crash, no console
    error, and saves again without losing its other layers. The removal broke nothing else: add a text, a shape and
    an element from the Add panel, change a fill, reorder layers, undo and redo.
 2. F2: at 360x740 and 390x844, light and dark: "Saving", "Saved" and "Not saved yet" are each readable in full,
    apart from the name field (give the draft a 40-letter name), and a long toast is whole.
 3. F3: freeze the API by PID (SIGSTOP) for 60 s while typing, then SIGCONT: "Not saved yet" within 20 s, one save
    in flight at most, saved once after, the server holds the last typed text; then the same with a second device
    having saved in between (the stale 409 path still offers "Open the newer one"; the patch treats a late 409
    whose server text equals the sent text as saved: can that hide a real conflict? try: device B changes ANOTHER
    field while A's save is frozen).
 4. The flow scripts/live/flows/w10.mjs passes; typecheck, gates, test:client EXIT 0.
Hand back ONCE in at most 12 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove your worktrees, stack and databases; leave no background jobs.
