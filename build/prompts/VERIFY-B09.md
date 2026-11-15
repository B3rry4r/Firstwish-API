VERIFIER B09 | TIER T2 full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B09.md (the cases are the contract),
.pipeline/declared/storage.json and upload-screening.json (by python, the parts on limits and rules), owner ruling R2 in build/rulings.md.
Under test: local branch `b09-files` (head aaabdfd) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 (f0be0ad). Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b09 (detached at the branch; `npm ci`); ports 4290-4299; database prefix vb09; remove both when done; kill by PID.
Endpoints: E-157, E-158, E-173, E-182..E-184, E-214, E-216. Run the stack (`scripts/stack.sh up vb09 4290`) for what HTTP can reach;
the stand-in store has no HTTP upload, so drive upload-then-confirm through createTestApp with the stand-in store in your own script.
Known and NOT findings (the builder halted; rulings X20-X27 in build/rulings-phase3.md): the ticket and signed-url response shapes;
the screening port has no score; image sizes port lives in the module; triggers stand in for foreign keys; no staff queue route;
kind against purpose; nothing runs the two jobs yet; Vault reads are owner only.
CLAIMS: each numbered line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b09/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - Someone else's file: with account B's token, confirm, read, delete and attach A's upload id and A's file id everywhere a file id
   is accepted (also inside a wish or brand body if those routes exist on this branch): never served, never changed. Guess ids.
 - The signed URLs: what exactly is signed (key, method, content type, length, expiry)? Can the PUT upload another type or a bigger
   body than asked (the confirm must catch it: prove with the stand-in)? Is the GET for one key only; does a read URL outlive a
   delete or a rejection (say for how long)? Keys: unguessable in live mode, never user text; a purpose or name with "../".
 - Confirm races: 20 confirms of one upload at once (one row, one screening, one Vault count); confirm then delete at once;
   delete while it is being attached to a wish.
 - Screening: a rejected file is unreadable by its owner and by the allowed hook, and its object is gone; a held file is owner
   only; the staff decision: every role against the registry, a 3-character reason, two decisions at once, a decision on a file
   that is not held; a file approved by staff then becomes readable.
 - Vault space: 30 parallel confirms around the limit (the sum never passes the limit, the counter equals the rows' sum); delete
   gives the bytes back exactly once (delete twice at once); a pack that has ended no longer counts (clock port); a ticket for
   more than what is left is refused up front.
 - Limits at the edges: 15 MB exactly and one byte more, for each kind; a zero-byte file; a type the kind does not allow (an
   executable called .jpg: is the type read from the bytes or trusted from storage's header? say); SVG as a photo (script inside).
 - The migration: on a fresh database and on one with rows naming files that do not exist (what happens? a failing deploy is a finding).
 - Cleanup job handler: called twice at once removes each stale upload once; it never touches a confirmed file.
 - Errors: the envelope; no 500 for a non-uuid id, a bad cursor, a huge body.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy fresh + migrate diff, `npm run test:affected -- src/modules` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b09/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
