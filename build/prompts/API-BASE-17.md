BUILDER API-BASE-17 | TIER T1 (which styles a wish may take; no money path changes) | Budget 70 steps. One rule gap the live harness found, and three small lows; change nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; a commit at every closed case; never
pkill, killall or pgrep -f (stop only PIDs you started); final runs in the FOREGROUND.
Read /home/user/Firstwish-API/build/common-rules.md, rulings IJ2, IJ4, IJ4a in build/rulings-phase3.md, src/modules/wishes/style-rule.ts
(offeredForKind, firstStyleFor, styleTakingRefusal, allowedLevel) and how the public styles list filters by kind
and occasion (the styles module; a style row has `kinds` and `occasions`: for example quiet: kinds ["love"],
occasions {"love": ["apology"]}).
Work: /home/user/Firstwish-API, local branch `api-base-17` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-17 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab17. Do not edit a gate or
a baseline; an older test changes only where IJ4a makes its expectation wrong (name each line and why). A
registry change only if a wire field changes (ONE reopen, additive).
Cases (through the real routes; a test for each; FIRST show what the head does today):
 1. IJ4a: "offered for the wish" = the kind AND, where the style names occasions for that kind, the wish's
    occasion: ONE function used by the server's own pick (a new wish, a business draft, a Concierge wish), the
    save, the kind change, an occasion change with a style held, the seal, the ticket start and settle, and
    `allowedStyles`; it agrees with the public styles list for every kind by occasion (a test that walks every
    kind by occasion in the catalogue: the list's styles == allowedStyles for a wish of that kind, occasion and
    ticket level; each listed one saves 200; a sample of unlisted ones 422 in words that name the rule). A wish
    with no occasion yet: only styles with no occasion limit for its kind. The server never picks a style the
    save would refuse (the seen case: Quiet, apology only, picked for a love birthday wish).
 2. LOW a PATCH that sets a switched-off CREATOR style answers 422 "Some fields need fixing.": it says the style
    rule's own words, as the house case does.
 3. LOW the public style read (E-196) has an ETag but no Cache-Control: the same header as the public styles list.
 4. LOW a path with a trailing slash on the two sample-wish reads answers 200: answer as the other public reads do
    for a trailing slash (find what they do; make these the same; if they also answer 200, change nothing and say).
Checks (quiet logs, EXIT lines): typecheck, the WHOLE `npm run lint`, scripts/gates.sh, check-contracts,
check-drift, check-routes, the wishes, purchases and styles specs, then `WEB_LIB=/nonexistent/lib npm test --
--maxWorkers=2` once: 0 failed. Commit on api-base-17; do not push; remove your worktree and databases; leave no
background jobs. Hand back ONCE in 8 lines: head; each case: what the head did before, closed or not, the test's
name; older tests changed (each line and why); totals.
