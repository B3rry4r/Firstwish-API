PATCH P-API-BASE-20 | TIER T2, round 1 | Budget 40 steps. Close the named findings of the verdict; change nothing else; keep the src change small.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md, the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-20/VERDICT.md (finding 1 and the lows, with
file:line) and rulings IJ3, IJ3a, IJ2, IL4 (in build/rulings-phase3.md ON THE BRANCH).
Work: the local branch `api-base-20` of /home/user/Firstwish-API (head 285a325) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab20 (`npm ci`,
`npx prisma generate`); TEST_DB_PREFIX=pab20. Do not edit a gate or a baseline; no wire change. Each: FIRST a failing test through the real routes.
 F1 (medium): wishes.service.ts:589 the server's pick on a move (pickStyle) reads the wish's raw adds, so it ignores
    IJ3a: with a premium-style extra whose refund was SENT, a kind move that sends no style picked a premium style
    (teams cells: milestone, gold-card). The pick uses what the wish HOLDS (as :444 does): never a style above the
    level the wish has paid for and still holds. Also prove what a seal did with such a wish before the fix.
 Lows: (a) wishes.service.ts:313 other owner answers say `adds: []` where the truth is not read: the field is
    absent there or true, never a false empty list (say which answers); (b) wish-adds.ts:45-63 an extra both
    included by the ticket and in adds shows once (from the ticket); (c) ab17-ij4a-occasion-style.spec.ts dropped the
    "Send a style ... same save" words check from the named-style refusal: put it back; (d) an owner's GET of an
    ERASED wish answers 200: is that so on the base 0aba805 too, and is it right by the rulings (what does it
    return: any content)? Report; fix only if this branch changed it.
 NOT yours (its own round next): the server enforces no clip count or length (the verdict's finding 2).
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the wishes
and purchases folders' specs; then `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: 0 failed (if your
session refuses that command, do not retry and ask nobody to run it: say NOT RUN). Commit on api-base-20; do not
push; remove your worktree. Hand back ONCE in 6 lines: head; each id before and after; the src lines changed
(count); (d)'s answer; the full run's totals or NOT RUN.
