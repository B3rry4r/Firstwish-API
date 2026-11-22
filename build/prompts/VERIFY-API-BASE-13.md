VERIFIER API-BASE-13 | TIER T2 identity and paid content, full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: run ONE heavy job at a time, jest with `--maxWorkers=2`, and write your
findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-13/NOTES.md as you go (if it exists an earlier verifier was lost: read it,
carry on).
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-13.md (its cases are the contract), rulings II1, II2, HX4, HW2,
IH1, IB1, IB2 in build/rulings-phase3.md, and the claims in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-13/CLAIMS.md.
Under test: /home/user/Firstwish-API, local branch `api-base-13` (head ba5db26) against its base 04b2b7a. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab13 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab13. Run every command with
your own worktree as the working directory. Probes as specs under the verify folder above (not in the repo).
Remove your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw), in this order:
 - Who can read a style's document (a creator's unpublished work is theirs; a leak is HIGH). For a style in every
   state (draft, submitted, refused, approved and live, switched off, withdrawn by its creator, creator erased):
   E-196 by id, by slug, in upper case, signed out, as another creator, as a customer; E-266 for a wish in that
   style. Then the wish's own gates at E-266: not yet opened, sealed until a later moment, a passcode with no
   token, a wrong token, another wish's token, an expired token; resting; removed; link off; a Concierge wish not
   delivered. Run the SAME reads on the base commit: did E-266 give a passcode wish's FILES without the token
   before (a pre-existing leak, reported apart)? Is the new x-unlock-token the same token E-129 uses?
 - Which version plays: approved v1; the creator edits (public still v1); resubmits (pending: still v1); v2 is
   approved: what E-196 gives, and what a wish MADE under v1 now plays at its link (say which; a paid wish
   changing its look by itself is a finding for the lead to rule). A refused resubmission leaves v1.
 - What the public document carries: list its top-level keys; any account id, contact, storage key, an address
   that never expires, AI words, notes or staff words in it is a finding. The files' addresses expire as E-266's
   did before. Cache: E-266 no-store; E-196's headers: could a shared cache keep a document after the style is off?
 - The erased creator (HX4): document and files still given at the link; what name or handle the answer shows.
 - Hearts (II2): a removed file, another shoot's file, another business's file, a file not ready: 422 in words,
   nothing stored; 30 marks in parallel with the file's removal: no heart left on a gone file; the limits of IB1
   and IB2 still hold with real files; an unmark of an old heart on a removed file clears it.
 - Refusal words (II2): every kind in the fixed list and an unknown kind (the default sentence); no provider or
   stand-in label text reaches E-184, E-267, E-268; a ready file's `reason` is null. The builder left the wish
   photo's reason passing the screening label through: show exactly what a customer reads there on the base and
   on the head, and say how bad it is.
 - The two older tests the builder changed (ab12-studio-reads.spec.ts, api-base-9-ib1.spec.ts): read both diffs:
   does each new expectation follow II1 or II2, and was anything else loosened?
 - The registry: additive only (no field removed or renamed; diff the exported contracts), endpoint ids
   unchanged, ui-align-tasks.json byte for byte; check-contracts, check-drift, check-routes, gates.sh, typecheck
   and the WHOLE `npm run lint` exit 0; `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once: totals. The
   builder saw api-base-7-studio.spec.ts test 7 (sweepUnattached) fail once in a parallel run: run that file 10
   times beside the other studio specs and say whether it is random and why.
Write VERDICT.md in the verify folder (40 lines or fewer): MERGE or FIX FIRST, each finding with its severity
(blocker, high, medium, low), file:line and what you saw. Hand back ONCE in 20 lines or fewer.
