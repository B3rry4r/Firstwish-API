VERIFIER API-BASE-5 | TIER T2, full | Budget 110 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-5.md (its cases 1-5 and 7 are the contract; 6, 8, 9 were handed
back and are not under test), rulings HQ1-HQ5, R14, FC1 in build/rulings.md and build/rulings-phase3.md, and the claims
in your spawn line.
Under test: /home/user/Firstwish-API, local branch `api-base-5` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab5 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab5. Probes as specs under
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab5/ (not in the repo). Remove your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). Security and money first:
 - The stand-in put (HQ3): it exists ONLY with PROVIDERS=standin and never with NODE_ENV=production or PROVIDERS=live
   (the real bootstrap; read the mount condition); a put with no signature, a changed one, another upload's
   signature, an expired one, a second put to the same ticket, a body larger than asked (stream 20 MB at a 1 MB
   ticket: is it cut off early or read into memory?), another content kind, a path walk: all refused, nothing stored;
   memory: 30 puts of 14 MB (does the API process grow without bound: the builder keeps objects in memory: say the
   bound or that there is none); another person confirming my upload; confirm twice; the bytes read back equal the
   bytes put; a put after the stack restarted (the builder says it is refused: with what words?).
 - The stand-in AI: each AI route answers in the contract's shape; the daily cap still counts real calls; the text
   sent is never stored where the erase rules do not cover it.
 - Styles by ticket (HQ5): for every ticket and every style level: PATCH and seal accept or refuse as the seed's rule
   says (a table); the premium-style extra lifts as claimed and only when paid; a wish on a business plan or a Pass;
   a draft that holds a style, then picks a lower ticket: what happens at the seal (the person must be told which to
   change); allowedStyles on the single read equals what PATCH enforces for 5 random pairs; no way to seal a
   Premium style on a Moment ticket by ordering the calls differently (style then ticket then seal; ticket, pay, then
   style; two tabs).
 - The maker's fields (HQ1): saved, read back, bounded (the bound's 422 names the field); after an erase they are
   gone (read the rows); the receiver gets them only when the wish is open, never before its time or without its
   passcode; staff reads never carry them unmasked beyond what staff already see.
 - The gather link (HQ4): the owner 200; another person 404; a draft 404 (is that right for a person collecting
   voices before sealing? say what the screen needs); what a friend's visit can do today (the builder says nothing:
   confirm no write is open).
 - Staff money (R14): payoutDay on PUT /admin/prices: who may set it, the range (1 to 28?), what the next payout
   run then uses, a version made; the price-book versions read (who, when) for owner, ops, finance and 403 for
   others; payments ?state= and businesses ?q= never widen what a role sees; erase of an erased person 409.
 - The seal fix ("the seal asked the pool inside its transaction: 50 sealed at once failed"): 50 and 100 seals at
   once: all answer, each wish sealed once, tickets and counters right, no pool exhaustion afterwards.
 - Clock port in notices and reveals: with the clock offset set, the stamps follow it; the two older tests changed
   (notices-p-b11.spec.ts, join6-eb1.spec.ts): read the diff: only the source of the time changed.
 - Registry: DEC-229 to DEC-234, E-256 the only endpoint added, ui-align-tasks.json byte-identical; every contract
   type that moved, listed; check-contracts, check-drift, check-routes, gates.sh; spec file count against the base.
 - `npm test -- --maxWorkers=2` once (the builder: 128 suites, 1237 passed, 1 failed = the seed-vs-web-files test,
   environmental: report it apart).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab5/VERDICT.md (40 lines or fewer). Hand back ONCE in 18 lines or fewer: merge or fix; findings
by severity (blocker, high, medium, low) with file:line; what you could not run.
