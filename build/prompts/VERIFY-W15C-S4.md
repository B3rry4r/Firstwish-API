VERIFIER W15C-S4 | TIER T1, lean (colours moved: nothing a person sees may change) | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w15c-s4/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/W15C-S4.md (its four RULES are the contract) and the builder's measure folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/w15c-s4-measure/ (MEASURE.txt, rows-cleared.json, the before/after records and pictures).
Under test: /home/user/Firstwish-web local branch `w15c-s4` (head 9dfd9c1) against its base 1f1a829. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws4 (`npm ci`) and an API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws4-api at the API commit in
your spawn line; ports 5740-5759; stack prefix vws4; BUILT. Probes under the verify folder.
 1. The gate, honestly: `python3 scripts/gates/run.py --json` on the base and on the branch: fail 0 both; accepted
    386 then 345; the 41 entries gone are exactly rows-cleared.json; NO new entry; `git diff 1f1a829..w15c-s4 --
    scripts/gates` is empty and the baseline file is untouched. The colours now live in styles/studio-colours.ts:
    read the gate's own code and settings (as they are on the BASE): is that path the token layer by the gate's
    existing rule, or does the gate simply not look there (say which, with the line)? Is anything in the new file
    NOT a colour token (logic, data that is not a design value)? Did any colour get a name that hides what it is?
 2. Values: every hex or rgb literal REMOVED by the diff appears in the token file with the same value (script it:
    list each removed literal and where it now is; any value changed, dropped or duplicated with a different
    value is a finding). The stored defaults: make a NEW blank style and a style from each house look through the
    Studio on the base and on the branch: the saved documents (server read) are byte for byte the same.
 3. What is drawn: the builder measured the Studio editor only. On the base and the branch, at 360, light and
    dark, compare pictures and computed colours of: the Studio editor with each palette and effect; a wish playing
    a moment with the gift box, the ring box, the fuse and the wax seal (the moments the diff touched); the
    scratch card. Pixel-compare where the scene is still (say the count of differing pixels) and compare the
    values the code passes to canvas where it animates.
 4. typecheck, test:client, check:css, build exit 0; tsconfig.json and wired.json untouched. Do NOT run the whole
    driver or the Studio flows (the harness's own wish maker is being fixed by another agent: w10 and wa7 fail
    at its makeSealed with a 422 on base and branch alike: confirm that in one run of w10 on the BASE only).
Write VERDICT.md in the verify folder (25 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees, stack and databases. Hand back ONCE in 12 lines or fewer.
