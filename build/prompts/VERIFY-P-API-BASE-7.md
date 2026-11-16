VERIFIER P-API-BASE-7 re-check | TIER T2 short | Budget 45 steps. You did not build this. Only the patch's F1-F6 and what it could break. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, the patch brief build/prompts/P-API-BASE-7.md and rulings HX1-HX5 in
build/rulings-phase3.md. Under test: /home/user/Firstwish-API local branch `api-base-7` (head in your spawn line; the first check's head was
9d34bec). Your own detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-ab7 (`npm ci`, prisma generate); ports 5210-5219;
TEST_DB_PREFIX=v2ab7. Run every command with your own worktree as the working directory. The first verifier's
probes are in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab7/: copy them to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab7/round2/ and run them on this head FIRST (the
builder did not): the probes for findings 1, 3, 4 and 5 must now pass; say each one's result.
Then attack:
 - F1: a moderator, support and ops changing a limit: 403; a limit of 0, negative, a fraction, a huge number and a
   text: refused with words; a changed photo limit binds the next upload and the read at once; the change is in the
   audit with who and the old and new value; an older book version still reads its own values.
 - F3: delete a draft while an upload for it is unconfirmed, confirmed, and mid-screening: no file or bytes left
   after the sweep; another creator's style id on an upload is still 404; the foreign key (ON DELETE SET NULL): can
   a file end with styleId NULL and stay for ever as "attached" to nothing (the 7-day sweep must take it)?
 - F4 (identity): erase a creator with one approved style in the catalogue and one draft: the approved style still
   plays for a buyer's wish (the player read gives its files); NO row or field anywhere still names the erased
   account on those files (read stored_file and any join table); the draft, its files, the profile picture and
   their bytes are gone; the royalties and payout rows follow the existing erase rule (say what it is).
 - F5: pick 25 staff writes across all sections by hand (not the builder's walk) and compare the session read's
   actions with the route's answer for each of the five roles; the handlers the builder RENAMED: do the routes,
   the contract ids and check-routes still agree, and did any audit action name change that the staff Audit screen
   filters by?
 - F6: the migration's backfill on a database that already has Signed creators with and without a Signed payment.
 - The three older tests the builder changed (api-base-7-book.spec.ts, price-book.contract.spec.ts): looser or right?
 - gates.sh, check-contracts, check-drift, check-routes EXIT 0; `npm test -- --maxWorkers=2` once, 0 failed.
Hand back ONCE in at most 14 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove your worktree and databases; leave no background jobs.
