VERIFIER API-BASE-17 | TIER T1, lean (which styles a wish may take) | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-17/NOTES.md.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-17.md (its cases are the contract) and rulings IJ2, IJ4, IJ4a in
build/rulings-phase3.md. Under test: /home/user/Firstwish-API local branch `api-base-17` (head 9bf3f93) against its base e30e5e6. Your own
detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab17 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab17. Probes as
specs under the verify folder.
The builder's claims: one rule `offeredForWish` (kind AND occasion) used by the server's pick, the save, a kind or
occasion change with a style held, the ticket start and settle, and allowedStyles; the SEAL still judges level
only; switched-off style words; E-196 Cache-Control; trailing slash unchanged; one older test changed
(refunds/tests/ab15r1-ij3-extra-refund.spec.ts:230,232: polaroid-table to mixtape); 1566 passed.
Check (each PASS or FAIL with what you saw):
 1. For EVERY kind by occasion in the catalogue and each ticket level (none, moment, keepsake, signature,
    premiere): the public styles list for that kind and occasion (E-195 as a signed-out person asks it), the
    wish's `allowedStyles`, and what a save accepts are the SAME set (script it: list every style in one and not
    another); a wish with no occasion; a wish whose occasion is then set, changed, cleared.
 2. The server's pick for a new wish of every kind by occasion (through the ROUTES: a person's new wish; a
    business draft if a plan can be set up; a Concierge wish): the picked style is in that wish's allowedStyles.
 3. The gap the builder left: the SEAL does not re-judge kind and occasion. Find a way to reach a seal with a style
    the rule would refuse (an occasion or kind changed by a route that skips the check; a style whose `occasions`
    staff change after it was taken; a creator style whose kinds changed in a new approved version): what the
    seal, the ticket start and the wish's link then do; say how bad (a wish that plays in a style not made for its
    occasion is a look problem, not a money one: unless it also crosses a ticket level).
 4. Money is untouched: 8 cells of the ticket-by-level matrix (your choice across house and creator) behave as on
    the base; the premium-style extra's refund rule (IJ3, IJ3a) still holds with a style that is occasion-limited.
 5. The lows: a switched-off house and creator style set by hand: the words; E-196's headers and its 304; the
    older test's change follows IJ4a and loosens nothing. The builder saw "a flaky wish-count check in
    ab16-sample-wishes trip once": run that spec beside the new ab17 spec 5 times: random or not, and why.
 6. typecheck, the WHOLE `npm run lint`, gates.sh, check-contracts, check-drift, check-routes exit 0; `WEB_LIB=
    /nonexistent/lib npm test -- --maxWorkers=2` once: totals.
Write VERDICT.md in the verify folder (25 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktree and databases. Hand back ONCE in 12 lines or fewer.
