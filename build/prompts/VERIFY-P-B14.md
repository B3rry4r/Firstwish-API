VERIFIER P-B14 | TIER T1 lean, re-check by ruling id | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B14.md (what the patch had to close), the rulings it names in
build/rulings-phase3.md, and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b14/VERDICT.md (round 1's findings).
Under test: local branch `p-b14` (head 0de210d) of /home/user/Firstwish-API; its base is local branch int-2 (51fb61e). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b14 (detached at the branch; `npm ci`); ports 4370-4379; database prefix vpb14; remove both when done; kill by PID.
Run the stack (`scripts/stack.sh up vpb14 4370`, seed it) and prove each ruling with your OWN requests and scripts (real HTTP where
a route exists, createTestApp otherwise; never the builder's spec as the proof). For EACH id say CLOSED or OPEN with what you saw:
 X1 (rate null under 200 previews, a number from 200), X2 (level filter exact values; PREMIUM is 422), X3 (StyleRate's seven keys),
 X4 (the same event key 20 times at once is one row; the key is in its own column; an event with no account once per key),
 X28 (the public levels read gives all 43 in one answer, no cursor; the ETag changes when the LAST style moves; 304 works),
 X29 (an event for a switched-off style is 422 and not counted; on again it counts).
Staff routes: sign in as the bootstrap owner (README: stand-in codes).
Also: every round-1 finding of this bundle is closed; nothing that passed in round 1 broke (re-run 5 of its attacks); the diff
touches only this bundle's modules (`git diff --stat int-2...p-b14`); anything NEW that is high or blocker.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b14/VERDICT-P.md (30 lines or fewer). Hand back in 12 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what you did not run.
