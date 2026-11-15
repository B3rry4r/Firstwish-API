VERIFIER P-B09 | TIER T2, re-check by ruling id | Budget 75 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B09.md (what the patch had to close), the rulings it names in
build/rulings-phase3.md, and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b09/VERDICT.md (round 1's findings).
Under test: local branch `p-b09` (head 1f1ffb6) of /home/user/Firstwish-API; its base is local branch int-2 (51fb61e). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b09 (detached at the branch; `npm ci`); ports 4420-4429; database prefix vpb09; remove both when done; kill by PID.
Run the stack (`scripts/stack.sh up vpb09 4420`, seed it) and prove each ruling with your OWN requests and scripts (real HTTP where
a route exists, createTestApp otherwise; never the builder's spec as the proof). For EACH id say CLOSED or OPEN with what you saw:
 Y1, the main one: upload and confirm a clean file; then with the OLD signed URL PUT (a) other bytes of the same type and length,
 (b) another type, (c) another length, each before and after confirm: the served file's bytes are unchanged every time, the Vault
 count is unchanged, the final key was never signed, and the stray is removed by the cleanup handler. Confirm a file, replace the
 staging object BETWEEN the server's copy and its read (if you can time it; say if not): what is screened is what is served.
 Y3: a program labelled image/jpeg, an SVG with script labelled image/png, an empty file: refused by the bytes; the real size is
 stored. Y4: no storage call inside a database transaction (read the code path; say how you know).
 X20 (ticket and signed-url shapes; delete answers 204), X21 (0.9 rejects, 0.5 to 0.89 holds, under 0.5 passes), X23 (real foreign
 keys: a row cannot name a missing file; a named file cannot be deleted), X24 (GET /v1/admin/screening-results for owner, ops,
 moderator; every other role 403), X25 (purpose in the body), X26 (the signed PUT binds type and length), X27 (a business's
 login reads its Vault files; a stranger and a removed login do not; a login sees only passed files), AA5 (purpose brand: photo
 rules, no SVG).
Races again: 20 confirms of one upload at once (one row, one copy, one screening, one Vault count); 30 Vault confirms at the
limit (the sum never passes it); delete twice at once gives the bytes back once; another account's ids everywhere: nothing.
Also: every round-1 finding of this bundle is closed; nothing that passed in round 1 broke (re-run 5 of its attacks); the diff
touches only this bundle's modules (`git diff --stat int-2...p-b09`); anything NEW that is high or blocker.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b09/VERDICT-P.md (30 lines or fewer). Hand back in 12 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what you did not run.
