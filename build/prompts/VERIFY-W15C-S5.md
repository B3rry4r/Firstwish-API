VERIFIER W15C-S5 | TIER T1, lean (colours moved: nothing a person sees may change) | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time; never pkill, killall or pgrep -f (stop only PIDs you started); notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w15c-s5/NOTES.md.
Read /home/user/Firstwish-API/build/prompts/W15C-S5.md (its four RULES are the contract) and the builder's folder
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/s5-out/ (measure.txt, record-before.json, record-after.json, pictures).
Under test: /home/user/Firstwish-web local branch `w15c-s5` (head 88eb8b0) against its base e453397. Your own detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws5 (the branch) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws5-base (the base) (`npm ci` each), and an API
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ws5-api at the API commit in your spawn line; ports 5760-5779; stack prefix vws5; BUILT.
 1. The gate: `python3 scripts/gates/run.py --json` on base and branch: fail 0 both; accepted 345 then 316; the 29
    entries gone are the ones the builder lists (Hero 5, How 5, posters 7, motion 12); 0 new; the diff of
    scripts/gates, the baseline file, tsconfig.json and wired.json is empty. styles/site-colours.ts holds only
    colour values under names that say what each is for (no logic, nothing renamed to hide it).
 2. Values: every hex or rgb literal REMOVED by the diff is in the token file with the same value (script it: 0
    missing, 0 changed); a colour that is data (the particle palettes, the wish-accent fallbacks) keeps its exact
    string, and a wish's own accent still wins where it did (one wish with its own accent on base and branch).
 3. What is drawn, base against branch, at 360 and 1440, light and dark: Home (the hero and the How section),
    /styles (the posters), /how, one style page with motion, and a wish playing with particles and an image
    transition (the motion engine): computed colours equal; pixel-compare the still frames (say the count of
    differing pixels and why); for canvas and WebGL compare the values the code passes.
 4. typecheck, test:client, check:css, build exit 0; the public pages' flow w1-site1 alone: totals. Do NOT run the
    whole driver (the harness is being fixed by another agent).
Write VERDICT.md in the verify folder (25 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees, stack and databases. Hand back ONCE in 12 lines or fewer.
