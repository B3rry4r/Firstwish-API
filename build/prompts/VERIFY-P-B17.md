VERIFIER P-B17 re-check | TIER T2 | Budget 30 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings OO1, OO2, OO6, RR1, RR2 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b17/VERDICT.md and its spec /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/vb17.spec.ts.keep (reuse it).
Under test: local branch `p-b17` (head 87eb1c6) against `b17-business` (87d15c3): `git diff b17-business p-b17` is all you check.
Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb17 (detached at p-b17; `npm ci`); ports 4740-4749; TEST_DB_PREFIX=vpb17; a clock in 2183; remove
both when done; kill by PID. Do not touch /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-b17.
Check by id, each PASS or FAIL with what you saw:
 RR1  the raw staff answers (E-23, E-24) hold no full login email in any field; the owner's own view is unchanged.
 RR2  the header x-business-id: a login of A and B reaches each and never the other's data; a header naming a business the
      person is not in, a removed login's business, a non-uuid, an empty value, two header values, and a header in another
      case: none reads or changes anything of another business; with no header the person's own business comes first. The
      routes now allow the "person" role: a plain person who is neither owner nor login gets 403 or 404 on EVERY route of the
      module (walk them all, writes too); a removed login with the header is 403 at once.
 OO2  one login-invite email per invite, none on a repeat; the wording has no placeholder left unfilled.
 OO6  reads in a new month write nothing; a draw then writes the roll; the numbers shown by a read equal what the draw writes.
 Also: the first verdict's "held" list still holds (run the old spec; say what changed), and the diff touches nothing else.
Checks (quiet logs, EXIT lines): typecheck, gates.sh, `npm run test:affected -- src/modules/pro-business src/modules/purchases
src/modules/notices` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b17/VERDICT-P.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
