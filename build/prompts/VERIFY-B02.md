VERIFIER B02 | TIER T2 full | Budget 85 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P5-COMMON.md, build/prompts/B02.md (the cases are the contract),
.pipeline/conventions.md, rulings Q7 and Q9 in build/rulings-phase3.md, and .pipeline/schema-map.json's erase rules (by script, not whole).
Under test: local branch `b02-account-sides` (head 09b338c) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8 (f0be0ad). Your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-b02 (detached at the branch; `npm ci`); ports 4270-4279; database prefix vb02; remove both when done; kill by PID.
Endpoints: E-5, E-7..E-11, E-26, E-42, E-57, E-58 (`python3 tools/pipeline/show.py endpoint E-5`). Run the stack
(`scripts/stack.sh up vb02 4270`) and attack over real HTTP with your own scripts; README says how the stand-in gives sign-in codes.
Known and NOT findings (the builder halted; rulings X6-X12): no public creator page route and no user erase route yet (attack the
erase SERVICE through a script on createTestApp); the house creator is absent; published_wish has no foreign key; erase leaves files.
CLAIMS: each line of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b02/CLAIMS.md: PASS or FAIL with what you saw.
Attacks:
 - Erase, the main risk. Make an account with everything you can give it through the API (name, handle, bio, phone, dates, people,
   both sides, brand, follows both ways, a draft wish row inserted directly, a payment and ledger row inserted directly, an audit
   row about it, sessions on two devices, a Google identity). Erase it. Then search EVERY table and column in the database for its
   email, name, handle, phone and bio (a script over information_schema: text and json columns): list every place still holding
   one. Each is HIGH unless schema-map says 'keep' with a reason. Payments and ledger rows still exist with their amounts. Its
   tokens and both refresh cookies are dead at once. A failure injected mid-way leaves the account whole.
 - Erase twice at once; erase with a session 11 minutes old (clock port); erase one account while it changes its handle.
 - Another account's data: with account B's token try every route with A's ids, handles and business id: nothing of A's private
   fields comes back and nothing of A's changes (owner check in the query; list any route that reads first and checks after).
 - Handles: 20 accounts take one handle at once (one wins); Unicode look-alikes, a trailing dot, 21 characters, "Admin", "FIRSTWISH";
   changing a handle frees the old one; can the old handle be taken by another account and inherit the follows? (must not).
 - Sides: on, off, on again (one row; history kept); business brand: a 301 KB logo, a logo that is SVG with script, a javascript:
   link, an http link, a colour "red;background:url(x)": each refused or made safe (stored XSS is HIGH: say what is stored).
 - Follow: 50 follows and unfollows of one creator at once from 5 accounts: the count equals the rows; follow a creator, then they
   turn the side off: gone from lists; the public list pages every creator once.
 - Errors: the envelope everywhere; no 500 for a bad cursor, a non-uuid id, a 1 MB body.
Checks (quiet logs, EXIT lines): build, typecheck, lint, gates.sh, check-contracts, `npm run test:affected -- src/modules test` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b02/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
