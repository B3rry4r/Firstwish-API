VERIFIER P-API-BASE-9 re-check | TIER T2 short | Budget 60 steps. You did not build this. Only the patch's F1-F7 and what it could break. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2` except the final full
runs; write your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab9/round2/NOTES.md as you go; stop only PIDs you started.
Read /home/user/Firstwish-API/build/common-rules.md, the patch brief build/prompts/P-API-BASE-9.md and rulings IC1-IC6, IA1, IA4 in
build/rulings-phase3.md. Under test: /home/user/Firstwish-API local branch `api-base-9` (head in your spawn line; the first check's head was
00ac9ff). Your own detached worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-ab9 (`npm ci`, prisma generate); ports 5210-5219;
TEST_DB_PREFIX=v2ab9. Run every command with your own worktree as the working directory. The first verifier's
probes are in /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab9/ (vab9-a/b/c.spec.ts): copy them to round2/ and run them on this head FIRST: the
ones for its findings 2, 3, 4, 5b, 5c, 6 and 7 must now pass (where a probe's expectation was the OLD behaviour,
say so and what the new one is); say each result.
Then attack:
 - IC1: a reveal with a passcode and downloads off: copy the link before and after switch-off, after the end, after
   `again` with and without a new passcode, after the passcode is changed: every link asks for the CURRENT passcode,
   gives no download, and is 410 once the reveal is off or ended; an old unlock token after the passcode changes.
 - IC2: mark three photos, remove the middle file, add a new file, copy the link, send again: the same two files
   carry the hearts everywhere (the client's read, the business's read, shoot.hearts); the migration's move of old
   positions on a database with marks made before it (the builder tested its statement: test it on real rows,
   including a mark whose position no longer exists).
 - IC3: the pack count after every order of the three calls; `again` on each; two different clients on one shoot.
 - IC4 (identity): the builder applied one helper (wishes/wish-shown.ts) across ten modules: grep src for every
   query that lists or reads a buyer's wishes and name any the helper does NOT cover (the dates feed, the home
   feed, saved wishes, follows, publish requests, staff People's wish count, the erase path, the receipts); the
   builder says erase and publish-requests answered 403 in its spec and the showing query is unproven: prove each.
 - IC5: plays from one address through 30 links, from 30 addresses through one link (what does the server take as
   the address behind a proxy: a forged X-Forwarded-For must not mint plays); the builder changed vault.spec.ts's
   old play count from 3 to 2: right?
 - F7: transactions now wait up to 15 s for a connection and run up to 20 s: 60 settles at once end with none
   failed; does any OTHER path now hold a request open for 15 to 20 s where it used to fail fast (name one user
   route and measure it under 60 contended calls)?
 - Older tests the builder edited (the same-wish re-send ones, ib1 "marks start over"): weaker or right by IC2/IC3?
 - gates.sh, check-contracts, check-drift, check-routes EXIT 0; `WEB_LIB=/nonexistent/lib npm test` twice, 0 failed.
Hand back ONCE in at most 14 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove your worktree and databases; leave no background jobs.
