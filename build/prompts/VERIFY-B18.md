VERIFIER B18 | TIER T1 lean plus the public link | Budget 55 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B18.md (the cases are the contract),
rulings EA1-EA4, OO1, OO3, RR2 in build/rulings-phase3.md.
Under test: local branch `b18-vault` (head 70a2464) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 at 8f32d91. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b18 (detached at the branch; `npm ci`); ports 4900-4909; TEST_DB_PREFIX=vb18 for every run; a clock in 2195
for your own cases; remove both when done; kill by PID.
Known and NOT findings (EA1-EA4): four raw-SQL tables (check-drift fails on them); routes outside the registry; a lapsed plan
still gets an upload ticket at E-182; client_wish.reveal survives the term end; the peak misses the file-confirm path.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b18/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - The public link (no account): the code's randomness (128 bits from a secure source: read the code); a code changed by one
   character, in another case, 1,000 guesses from one address (limited; no oracle that tells a real code from a wrong one by
   status, body or time: say what differs); the answer holds only that shoot's CHOSEN files (not the rest of the shoot, not
   another shoot's, not another business's), every address expires and cannot be reused after the link is switched off or
   ended; no business login email, owner email or storage key in the body; the passcode: wrong tries lock as the brief says,
   the lock is per link and does not lock another link; a link switched off, ended, of a deleted shoot, of an erased owner
   after the term: 410 with no content.
 - Another business: B's owner and login with A's shoot, file, link and wish ids on every route and verb; the x-business-id
   header naming A from B's login; attaching A's file ids to B's shoot (E-171, E-172) must be refused (HIGH if a business
   can put another's files in its reveal).
 - Space: by hand: plan GB + pack + bought blocks; 30 confirms at once with room for 7; a revoked grant; a lapsed plan; a
   file counted once when two shoots hold it; deleting a shoot gives the space back once.
 - E-33: 20 sends at once with one key (one email), with 20 keys (20 emails: is there any limit: say); the key reused for
   another wish; a client email with a NUL byte or 500 characters; the email names the business and holds the link, and the
   passcode is NOT in the email.
 - Plays: 30 opens from one visitor and from 30 visitors: the counts by hand; the table holds no address or agent string.
 - Erase and lapse: as the brief's cases 6 and 7.
 - Errors: the envelope; no 500 for a non-uuid id, a bad cursor, a NUL byte.
 - The edits outside the module (link-limits countTry, public-wishes, wishes hashPasscode): the receiver link's own specs
   pass and its wrong-try behaviour is unchanged (compare with the base).
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, migrate deploy on a fresh database,
`npm run test:affected -- src/modules/vault src/modules/public-wishes src/modules/notices src/modules/stored-files
src/modules/pro-business` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b18/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run.
