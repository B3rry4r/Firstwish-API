VERIFIER P-B10 | TIER T2, re-check by ruling id | Budget 60 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B10.md, rulings NN1-NN7, EE7 in build/rulings-phase3.md, and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b10/VERDICT.md (round 1).
Under test: local branch `p-b10` (head b517fbc) of /home/user/Firstwish-API; base local branch int-3 at 0e433c4. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b10 (detached at the branch; `npm ci`); ports 4650-4659; TEST_DB_PREFIX=vpb10 for every run; a clock in the year 2170 for
your own cases; remove both when done; kill by PID.
Known and NOT findings: typecheck and build fail only at src/modules/purchases/grants.ts(84) (fixed on another branch); E-131's
registry shape (NN7); a zero-width joiner in a reaction is refused for now (NN7).
With your OWN script on createTestApp, supertest and the clock port, say CLOSED or OPEN for each:
 NN2, the main one: a paid, sealed wish with no passcode. At and after its open time send 50 GETs, a HEAD, an OPTIONS, a GET
      with every header and query you can think of: openedAt stays null, state sealed, no first-opening row, no term, and the
      body holds ONLY the opening view (search it for the letter's words, file links, names beyond the receiver's). Then one
      POST /v1/w/:slug/opens: the full view comes back, openedAt is set, endsAt = openedAt + the ticket's term, one transition.
      20 such POSTs at once on a fresh wish: one first opening. A POST one second before the open time: refused, nothing
      started. With a passcode: a POST without a good unlock token is refused and starts nothing; with it: opens. After the
      opening a GET gives the full view. A link-preview robot (a GET with a bot user agent, then nothing): the term never starts.
 NN1: a published wish that is sealed, or live with a future open time, or past its end: 404 for play and share; live and open: 200.
 NN3: slugs with %00, %, %ZZ, a control escape: 404 in the envelope on every route, never 400, 422 or 500.
 NN4: the stored limit keys and fallback session are not a bare sha256 of the address (compute it yourself and compare).
 NN5: a reaction with a direction override or a zero-width space is 422; plain text, an accent, a plain emoji pass.
Round 1 again: nothing early by any header, query, token or route; 410 with nothing after the end; 40 addresses at once with the
right code inside: at most 30 checked, the right code while locked refused; an unlock token dies on a changed passcode and at
15 minutes; no sender data in any state; reactions and favourites refused until opened.
Also: the diff touches only src/modules/public-wishes; anything NEW that is high or blocker (in particular: can ANY call other
than the POST start the term; can the POST be made to start it for a wish that is resting, removed or erased).
Checks (quiet logs, EXIT lines): lint on the module, gates.sh, check-contracts, `npm run test:affected -- src/modules/public-wishes` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b10/VERDICT-P.md (30 lines or fewer). Hand back in 12 lines or fewer: verdict merge or fix; each OPEN id with
severity and file:line; new findings; what you did not run.
