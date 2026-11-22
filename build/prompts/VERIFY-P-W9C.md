VERIFIER P-W9c (re-check of a re-cut patch) | TIER T2 (pack wishes are paid) | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes as you go in
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w9-business2/round3/NOTES.md (if it exists an earlier verifier was lost: read it and carry on). Stop
only PIDs you started.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md, the patch brief build/prompts/P-W9C.md (F1-F3), rulings IA1, IC1, IC3, IC8
in build/rulings-phase3.md, and the second check's notes /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w9-business2/round2/NOTES.md.
Under test: /home/user/Firstwish-web local branch `w9-business2c` (head in your spawn line). Your OWN detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w9c (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w9c-api (API at the commit in your spawn line); stack prefix vw9c; ports
5600-5619; the stack BUILT (`npm run live:up -- --built`, never next dev); the driver as `node scripts/live/drive.mjs`
on a FRESH stack. Run every command with your own worktree as the working directory.
Re-check, counting on the server after each (the pack, client wishes, reveals, the outbox):
 F1 (was HIGH twice): sending a reveal is ONE call to POST /v1/business/reveals (read the network: no other write).
    One wish and one reveal, or neither, for: a refused send then fixed; a lost answer then a retry; a reload
    mid-send; back then send; two tabs; TWO DIFFERENT BROWSERS at once (five rounds); the same form sent the NEXT
    DAY by the SERVER's clock (the builder moved only the browser's clock: restart your stack with
    STANDIN_CLOCK_OFFSET, or say why you could not); a client wish the business made on purpose for the same
    client and day is never touched. Changing who it goes to and back again: which key is sent each time, and can
    that sequence take two wishes for one client or send to the wrong one? A pack with one wish left, two browsers.
 F2: Send again says it takes no wish and sends the email again, and does exactly that; a different client says
    it takes one wish, and does.
 F3: /r/<code> has the receiver's chrome and no extra mark; let a REAL server unlock run out (15 minutes by the
    server's clock; the builder used a stub): the page asks for the passcode again in the receiver's words.
 Then: w9.mjs alone 0 FAIL (the builder re-typed its last flow edits after losing them: this run is the proof);
 the whole driver on a fresh stack: say every FAIL (the builder's base is old: two W7 FAILs are known on it);
 typecheck, gates, test:client EXIT 0; the five Vault screens at 360 and 1440, light and dark: no sideways scroll,
 0 console errors, storage empty (R10).
Hand back ONCE in at most 15 lines: verdict (merge / fix first), each F with PASS or FAIL and file:line, new findings
by severity, what was not run. Remove YOUR worktrees, stack and databases; leave no background jobs.
