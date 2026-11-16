VERIFIER wave 6 join | TIER T2, money, erase and ownership | Budget 80 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/WAVE6-JOIN.md (J0 to J10 are the contract), and in
build/rulings-phase3.md: ZB3, ZB4, ZB5, GB1, EA3, EA4, EB1, FA1, HB1, HB3, HB4, HC1, RR3.
Under test: local branch `p-join6` at 22f7dbe of /home/user/Firstwish-API. What the join itself wrote is the commits after its last
merge commit (`git log --oneline --first-parent bccd529..22f7dbe`). Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-join6 (detached at 22f7dbe;
`npm ci`); ports 5060-5069; TEST_DB_PREFIX=vjoin6; a clock in 2206; your own addresses (uniqueAddress) and price-book version 1;
remove both when done; kill by PID. `node scripts/check-routes.mjs` fails here by design (28 stale baseline lines the lead removes).
Known and NOT findings: a cancelled job with history is marked succeeded (no cancelled status yet); the schema-map rule for
ClientWish.reveal still says keep; HC1 (the Vault files of a reveal still playing after the owner's erase are removed by
the owner's file job): confirm it and report it as the known MEDIUM with file:line.
Check, each PASS or FAIL with what you saw (rows only through the real routes; figures and ledgers by hand first):
 J1  a login makes three business wishes (a draft, a sealed, a live). (a) The owner removes the login: in that transaction the
     wishes are the owner's; the removed login gets 404 on read, edit, seal, share, delete, keep and the receiver-activity
     read of each, and cannot list them; the owner can do all of those; the links keep playing. (b) The login erases their
     own account instead: the same, and the login's name and email are in no table (scan). (c) The login's OWN personal
     wishes do not pass to anyone and are erased as before. (d) 20 removals and wish edits at once: no wish is left with a
     dead owner, none is lost. (e) A login removed and invited again does not get the wishes back by itself.
 J2  sheet (E-30) and date (E-32) wishes sealed in a creator's Premium style: the share by hand (Starter, Studio, pack, a
     rolled wish); once per wish whichever seal runs (seal with usePlan then the ordinary seal cannot both earn); a refund
     of the plan takes it back.
 J6  VAT by hand for a Pro plan, a pack, a Vault block and a Concierge order at list and at 40% off: the invoice's VAT part
     equals vat_payable in the ledger to the kobo; a creator plan, a credit pack and an extra review: invoice VAT 0 and no
     vat_payable row; a payment with a VAT line and a non-VAT line together (if one can be made): by hand; the Numbers lines
     (staff) stay net of VAT as before.
 J9, J10  a wish opened under a live Pass ends with the Pass; the rest job does not rest a covered wish and sets the next
     time; the order "rests until restore-window-end ran, woken, rests again, a keep is paid" settles; 300 random orders of
     keep, refund, Pass and time events (reuse /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b22/vpb22.fuzz.spec.ts): no throw, the end always equals the by-hand
     function, no job is left that would rest a covered wish or wake a dead one.
 J3, J4, J5  as the brief says (J5: the limits by hand; the day boundary).
 The merge itself: the staff-reads kit was changed to put letter and photos in content: do the staff reads still show NO
     words or photos (raw JSON)? The four merged branches' own verdict cases still hold: run each branch's kept attack spec
     that exists under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify (b21, b16b, b22, b23) where it runs unchanged; name what fails.
Checks (quiet logs, EXIT lines): build, typecheck, gates.sh, check-contracts, check-drift, `npm test` (--maxWorkers=2) twice
(name any failing test).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/join6/VERDICT.md (35 lines or fewer). Hand back in 18 lines or fewer: merge or fix; findings by severity with file:line.
