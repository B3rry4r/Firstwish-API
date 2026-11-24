VERIFIER R4, the re-check after two fix rounds | TIER T2 (it changed 200-odd style files) | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, only when `free -g` shows 6 GB or more; NO single command longer than 8 minutes (run long flows in the background with a log and wait
in loops of 230 s or less); never pkill, killall or pgrep -f (stop only PIDs you started); never edit, build, checkout or reset anything in
/home/user/Firstwish-web or /home/user/Firstwish-API themselves; notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4/NOTES2.md.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, /home/user/Firstwish-API/build/prompts/P-R4.md and P2-R4.md (the two fix rounds' briefs), the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4/VERDICT.md (its findings H1, M3 to M7), rulings IK6, IK6a, IK7a (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Under test: /home/user/Firstwish-web local branch `r4` (head 6da70e4) against the work branch's head 67ff8bf (its base). Your own detached worktrees
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-r4 (the branch) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-r4-base (the base) (`npm ci` each), and an API
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-r4-api at API commit 976182d; ports 5660-5679; stack prefix v2r4; BUILT; stand-ins only.
The fix rounds' claims: a `render` flag in the engine's context (components/engine/controls.tsx: Press, Anchor, Field,
Hint, Hush) applied over 200-odd files; OUTSIDE a render every wrapper draws exactly the element it stands for; under
the render page nothing pressable and no action words from ready to done (a sweep of 20 house styles with their first
ending and 10 ending scenes: clean); the fireworks ending's sky div lost its role, tabIndex, handler and label UNDER
THE FLAG; scene timing (sceneName flips when the scene is on show; done 1.5 s after) and window.__render.scenes;
stack.mjs + r4.mjs use the hold file, so w3, pw3, pf1, w10b, w10c, w17, r4 pass on one stack; gates 0 new (289
accepted, keys unchanged), lint 863. The builder compared a RECEIVER's view on ten styles (letter, noir, lookbook,
mixtape, gold-card, polaroid-table, reel, aso-ebi, status, group-chat): 0 differences in controls, pixels within
noise. NOT covered by anyone for receivers: the endings fireworks, gift-box, ring-box, scratch-foil, calendar-leaf,
film-credits, sign-off; the other 30-odd styles; every ending of every style under the render sweep.
Check in a real browser (each PASS or FAIL with what you saw; a receiver's control that lost its role, name, focus or
its action is a BLOCKER):
 1. Receivers, where nobody looked: base against branch at /w/<slug>, 360 and 1440, for TEN styles NOT in the list
    above (two from each family where there are that many) and for EACH of the seven endings named above: every
    control still there with the same role and name, and it still WORKS: press it (the candle blows out, the
    fireworks sky answers a tap, the gift opens, the foil scratches, the ring box opens, the question takes an
    answer and sends it): the same result as on the base. Keyboard: Tab reaches each, Enter or Space works.
    Also the maker's preview and the Studio's live preview of two styles: controls unchanged.
 2. The code: read components/engine/controls.tsx; then grep the diff for any place a control's props, ref, key,
    handler or surrounding element changed beyond the wrapper's name (a codemod slip: a dropped ref, a lost
    type="button", a changed tag, a `Hint` that is a <p> where the original was a <span> or <div>: that changes
    layout): list each with file:line.
 3. Under the render page: run the sweep the builder did not: every ending of FIVE styles (R4_SWEEP=all for those;
    in parts), and five styles outside its twenty: ready to done, zero focusable elements, zero role button or
    link, no action words; a wish with a voice note and a song link (no sound control drawn, nothing plays).
 4. The first verdict's ids, each CLOSED or OPEN: H1 (w10b and r4 on one stack: pass, and the time), M3, M4, M5,
    M6 (`__render.scenes`), M7 (the scene told is the scene on show: measure the gap on scroll and film).
 5. tsc, gates (289 accepted, 0 new; scripts/gates and the baseline untouched in the diff), test:client, lint (863
    or fewer), check:css, build, contracts:check against 976182d; r4.mjs once.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/r4/VERDICT2.md (40 lines or fewer): MERGE or FIX FIRST, findings by severity with
file:line; say plainly what you did not reach. Stop your stacks and browsers by PID, drop your databases, remove your
worktrees. Hand back ONCE in 15 lines.
