VERIFIER P-B02 | TIER T2, re-check by ruling id | Budget 70 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B02.md (what the patch had to close), the rulings it names in
build/rulings-phase3.md, and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b02/VERDICT.md (round 1's findings).
Under test: local branch `p-b02` (head 996d835) of /home/user/Firstwish-API; its base is local branch int-2 (51fb61e). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b02 (detached at the branch; `npm ci`); ports 4410-4419; database prefix vpb02; remove both when done; kill by PID.
Run the stack (`scripts/stack.sh up vpb02 4410`, seed it) and prove each ruling with your OWN requests and scripts (real HTTP where
a route exists, createTestApp otherwise; never the builder's spec as the proof). For EACH id say CLOSED or OPEN with what you saw:
 AA1: race erase against PATCH /me, a handle change, side on, side off, follow, brand patch, 10 times each, with your own
 script: after each, the erased account holds no name, handle, bio or brand, no follow row points at it, and its handle is free.
 AA2: build an account with everything (as round 1 did), erase it, then search EVERY text and json column of the database for its
 email, name, handle, phone, bio, business name, brand words, date notes: none left except where schema-map says keep.
 AA3: a NUL byte in each text field of these routes is 422. AA4: links stored as the parsed URL (try the three round-1 strings).
 AA5: the logo is a stored file id (purpose brand); another account's file id, a rejected file and an SVG are refused.
 X6: GET /v1/creators/:handle public fields only; one 404 for missing, side off, banned, erased. X7: POST /v1/me/erase needs a
 sign-in younger than 10 minutes (clock port: 9 and 11 minutes), body {confirm:"erase"}; then every session is dead.
 X8: the house creator firstwish is listed and cannot be signed into or taken as a handle. X11: E-5 for any signed-in user.
 X10: the erased account's wish links answer gone. (Known and NOT a finding: removing its stored files waits for the files bundle.)
New-risk check: can erase be started for ANOTHER account (ids, handles in the body or path)? Can a session older than 10 minutes
erase by refreshing first (a refresh must not make the sign-in fresh)? Two erases at once: one audit row.
Also: every round-1 finding of this bundle is closed; nothing that passed in round 1 broke (re-run 5 of its attacks); the diff
touches only this bundle's modules (`git diff --stat int-2...p-b02`); anything NEW that is high or blocker.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b02/VERDICT-P.md (30 lines or fewer). Hand back in 12 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what you did not run.
