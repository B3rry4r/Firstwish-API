PATCH P-WEB-10A | TIER T2 (a receiver's secret), round 1 | Budget 45 steps. Close the named findings of the verdict; change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started);
never touch scripts/gates/** or the baseline file; final suites in the FOREGROUND; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, /home/user/Firstwish-API/build/prompts/WEB-10A.md, the verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-10a/VERDICT.md (M1, L2, L3, L4, L5 with their file:line) and rulings IK1, IK2
(the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Work: the local branch `web-10a` of /home/user/Firstwish-web (head b0c15e4) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-web-10a
(`npm ci`); API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-web-10a-api at the API commit in your spawn line; ports 5660-5679; stack
prefix pw10a; BUILT. You own the files WEB-10A owned. Each finding: FIRST a failing check in scripts/live/flows/w10a.mjs, then the fix.
 M1 (medium): changing the kind or occasion to one that allows no passcode or question (love birthday -> Apology)
    leaves content.opening as passcode and the hash set: the wish then seals behind a gate the maker never shows.
    When the wish's opening is no longer one its kind and occasion allow, the same save writes the allowed opening
    and sends `passcode: null`; after it the server says hasPasscode false and the opening step shows a selection.
    The other way too (back to an occasion that allows it: nothing is "set" until a new code is typed).
 L2: /app/new?at=ticket (or any later step) by address while the opening needs a secret and none is set or typed:
    the maker goes to the opening step and says why; it never pays or seals from there. (The server will also
    refuse that seal with 422 and words after its next round: show the server's words wherever a seal is refused;
    say where they appear.)
 L3: passcode -> question says "An answer is set." before the clear is saved and keeps saying it when that save is
    blocked: it says set only on the server's hasPasscode after its own save; a blocked save says so, with Try again.
 L4: Enter or Space on "Change the code" puts the focus in the field (typed keys land there); keyboard only, both ways.
 L5: a code or answer of only spaces is not sent: the 4-to-64 words show (count what is left after outer spaces
    are cut; send it cut, so a receiver never has to type invisible spaces).
Not yours: the contract's type for `passcode` (the server's next round makes it string or null; keep the cast, one line, with a note).
Checks (quiet logs, EXIT lines): `npx tsc --noEmit`, `npm run gates` (0 new), `npm run test:client`, `npm run lint`
(867 warnings or fewer), `npm run check:css`, `npm run build`; w10a.mjs twice: 0 FAIL; the maker flows w4-maker1,
w5-maker2, pf1, p-w5, w6-maker3 once: 0 FAIL. Commit on web-10a; do not push; stop your stack by PID; remove both
worktrees. Hand back ONCE in 8 lines: head; each finding before and after; what was NOT run.
