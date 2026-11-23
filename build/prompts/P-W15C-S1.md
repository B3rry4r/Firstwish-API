PATCH P-W15C-S1 round 1 | TIER T1 | Budget 45 steps. Two findings from the check of the previews bundle; change nothing else.
ONE heavy job at a time; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs you started);
never touch scripts/gates/** or the baseline file; hand back once, nothing running.
Read /home/user/Firstwish-API/build/prompts/W15C-S1.md (case 1: "if the read fails: the designed error words where the screen has them,
else the still stays; never an empty frame") and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w15c-s1/VERDICT.md.
Work: branch `w15c-s1` (d1a5844) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w15c-s1 (`npm ci`); API worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w15c-s1-api at the API commit in your spawn line (it now holds 45 samples: photographers /
your-finals too); contracts:check exits 0. Ports 5780-5799; stack prefix ws1; BUILT.
 F1 MEDIUM components/engine/Preview.tsx:166 with preview.css:16: when the samples read fails (500, offline) a
    tile of a style that has no recording is a near-black frame with no words and no way to try again: a person
    reads it as broken. A tile whose sample cannot be read draws the style's own still: its poster (the style's
    designed poster the site already draws on /styles: find how a poster is made for a style and use that same
    piece; do not fork it), and the page of tiles says once, in the screen's designed error words, that the
    previews could not be read, with Try again that reads the list once more. While it is read: as now. Prove it
    in ws1.mjs with every recording removed in YOUR worktree only (never commit that): 500, offline, then Try
    again; measure the tiles at 360, 390, 1440, light and dark; one picture pair.
 F2 LOW lib/wish-model.ts SAMPLES (about line 177) and sample() (about line 279) have no importer: delete them
    (prove with grep that nothing imports them; typecheck and build).
 Also prove the 45th: the Studio's preview and a tile for photographers / your-finals play the server's sample
 (no failed state) with its download links.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates (fail 0; say the accepted
count), test:client, contracts:check, build; ws1.mjs alone twice: 0 FAIL. Commit; do not push; stack down,
databases and worktrees removed. Hand back ONCE in 6 lines: head; F1, F2 with file:line and the proof; the gate's
accepted count; ws1's totals.
