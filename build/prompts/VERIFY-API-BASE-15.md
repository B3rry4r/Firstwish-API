VERIFIER API-BASE-15 | TIER T2 money (what a ticket buys), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-15/NOTES.md as you go (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-15.md (its cases are the contract), ruling IJ2 in
build/rulings-phase3.md and product truths T-01 to T-08 and T-30 in .pipeline/product-truths.json.
Under test: /home/user/Firstwish-API local branch `api-base-15` (head 2315e2a) against its base f44d662. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab15 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab15. Probes as specs under the
verify folder (not in the repo).
The builder's claims: on the base a ticket start (201) and its settlement were accepted for a wish holding a style
ABOVE the ticket's level, a love-only style saved on a group wish (200), and a style switched off before the
ticket start was accepted; all three are now refused in words (422) for house and creator styles; a new wish
column `styleTakenLevel` (migration 20261206090000, backfilled) so a later staff raise changes nothing for a wish
that already holds the style; a style with no kinds named is offered to every kind; support hand-over only to
roles that open Support, 409 thread_changed_hands with the new optional `expectedAssignee`; a new additive field
Wish.extrasOpen; DEC-306 to DEC-308; older tests changed: api-base-5.spec.ts lines 154, 162, 169, 171, 174, 200,
api-base-5-seal-style.spec.ts:108, ab13-r1-style-version.spec.ts:226, join5.spec.ts:176; 1528 passed. NOT covered
by the builder: the Concierge maker route; `allowedStyles` on the wish read still filters by level only; changing
a wish's KIND with a style already held is not re-checked.
Attack through the real routes with real payments on the stand-in (each PASS or FAIL with what you saw):
 1. Can a person still get more than they paid for (a HIGH if yes)? For every ticket (moment, keepsake,
    signature, premiere) by every style level (starter, standard, premium, video), house and creator: style then
    ticket; ticket then style; style, ticket started, style changed while the payment is pending, then settled;
    two tabs; the upgrade paths (a Moment becoming a Keepsake for the difference, a Signature becoming a
    Premiere) with a style allowed only after the upgrade and chosen before it settles; the premium-style extra
    on a Keepsake (T-30): bought then the style, the style then the extra, the extra refunded with the style
    kept; a failed and an abandoned payment leave no higher style on a cheaper ticket; a webhook replayed. After
    each: the wish's style, ticket, what the ledger says was paid, and what E-129 lets a receiver play.
 2. The paths the builder did not cover: the Concierge maker making a wish in a style above the order's ticket;
    changing the wish's KIND after a style is held (a love style on a group wish by changing the kind); seal with
    a style that was switched off, or whose level was raised, after it was taken (the wish keeps it: nothing more
    charged, nothing refunded by itself: prove on the ledger); `allowedStyles` on the wish read against what the
    PATCH accepts (list every style it offers that the PATCH refuses, and the reverse).
 3. The migration on base-shaped rows: wishes with and without a style, with a style since switched off, raised,
    deleted; wishes already holding a style ABOVE their ticket (the hole was open: how many would exist is
    unknown): what `styleTakenLevel` they get and whether such a wish can still be sealed, paid, played (it must
    not lock a paid customer out; say what happens). Twice identical. A way back.
 4. Hand-over: every staff role listed or not, accepted or not; `expectedAssignee` right, wrong, absent; two
    staff at once with it (one 200, one 409 in words); a removed and a suspended member.
 5. Wish.extrasOpen for each ticket and wish state against what the extra's payment start answers (they must
    never disagree); a wish that opens between the read and the start.
 6. The older tests changed: read each line's diff: does the new expectation follow IJ2 (name the rule), or was a
    check loosened or removed?
 7. The registry: additive only, ids unchanged, ui-align-tasks.json byte for byte; typecheck, the WHOLE `npm run
    lint`, gates.sh, check-contracts, check-drift, check-routes exit 0; `WEB_LIB=/nonexistent/lib npm test --
    --maxWorkers=2` once: totals.
Write VERDICT.md in the verify folder (40 lines or fewer): MERGE or FIX FIRST; each finding with severity
(blocker, high, medium, low) and file:line. Remove your worktree and databases; leave no jobs. Hand back ONCE in
20 lines or fewer.
