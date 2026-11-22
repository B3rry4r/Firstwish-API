VERIFIER P-FLOW-1 | TIER T1, lean (one change reaches EVERY signed-in screen: check that one fully) | Budget 50 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; notes to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/p-flow-1/NOTES.md as you go; stop only PIDs you started.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, P-FLOW-1.md and P2-FLOW-1.md (same folder: their items are the contract).
Under test: /home/user/Firstwish-web local branch `p-flow-1` (the head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree .../build/wt/v-pf1 (`npm ci`) and an API worktree .../build/wt/v-pf1-api at the API commit in your spawn
line; ports 5700-5719; stack prefix vpf1; the stack BUILT. Probes under the verify folder, not in the repo.
 1. components/app/AppShell.tsx now draws "Getting your account." while the account read is in flight and the
    server's words with Try again when it fails, on EVERY /app screen. With the read held 5 s, failed (500),
    cut (offline) and answered 401: on /app, /app/wishes, /app/wishes/<id>, /app/you, /app/pass, /app/dates,
    /app/pro (a business), /app/creator (a creator), the maker mid-draft and a payment return with ?reference=:
    what is drawn; nothing of another person or an older visit shows; Try again recovers WITHOUT losing the page's
    address, its ?reference= or a draft's typed words; a 401 still goes to sign-in as before (compare with the
    base); no flash of the loading words on a normal fast load that moves the layout (measure at 360).
 2. The You screen's loading and error states (UA-544, UA-545) and the Pass row's: drawn as designed, entered
    as the rows' enterCondition says (read the two rows in /home/user/Firstwish-API/.pipeline/ui-align-tasks.json).
 3. The maker's style step: with the levels read held and failed Continue is not active and words say why; Try
    again recovers; a style the server does not offer cannot be continued with (set it by hand in the draft);
    the creator's own style still can.
 4. The video offer on the wish page, by state and ticket: draft and sealed Keepsake (may buy: the start is 201),
    showing Keepsake (no buy offer), showing Signature (included: offered, asking works with no payment), resting
    (offered), removed (not), a wish whose video was asked (its status shows). The server's 422 words show if the
    wish opens between the page load and the tap.
 5. The flows the builder changed (p-w5, w5-maker2, web-api-4, w3, pw3, wa6b if touched): read each diff: a wait
    was added or an expectation corrected, never loosened; each alone once: totals. pf1.mjs alone: totals.
 6. typecheck, gates (no new entry; baseline, wired.json and tsconfig.json equal to the head's), test:client,
    check:css, build exit 0; R10 storage empty; the whole driver ONCE on a fresh stack: totals (a FAIL: rerun
    that flow alone twice and report both).
Write VERDICT.md in the verify folder (30 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees, stack and databases. Hand back ONCE in 15 lines or fewer.
