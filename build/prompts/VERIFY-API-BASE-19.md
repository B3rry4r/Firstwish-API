VERIFIER API-BASE-19 | TIER T2 (a receiver's secret; a paid extra), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-19/NOTES.md (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/API-BASE-19.md (its cases are the contract), rulings IK1 to IK5 (the END of
/home/user/Firstwish-API/build/rulings-phase3.md), Q8, GG7, LL3, LL4, NN6, HP5 there.
Under test: /home/user/Firstwish-API local branch `api-base-19` (head 5854cef) against its base 04e6497. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab19 (`npm ci`, `npx prisma generate`); ports 5210-5219; TEST_DB_PREFIX=vab19. Probes as specs under
the verify folder (not in the repo), run through the real routes.
The builder's claims: (1) a seal with a passcode or question opening and no stored secret is 422 with words on every
seal route (ticket, Pass, business plan, Concierge maker on an order; a business order and a group wish end in the
same POST /wishes/:id/seal); the hash clears when the opening has no secret or passcode and question swap without a
new `passcode`; code and answer inside content are stripped (was 500), no read returns them; an answer ignores case
and outer spaces, a passcode is exact; the 10-an-hour and 30-lock limits unchanged. (2) no renderer: the video
extra's payment start is 409 extra_not_sold, no payment row, extrasOpen false; a paid wish keeps 503 with words;
PROVIDERS=standin binds the stand-in renderer, STANDIN_VIDEO=fail refused at boot with live providers; failed ->
ask again -> ready; ready gives downloadUrl (10 minutes) whose bytes are the stored file; other person 404, signed
out 401; a second start is 422, no second payment. (3) the Studio's save and send-in answer 422 for an unknown base,
layout or added kind; all 44 seed bases, both layout modes and 8 added kinds still save. One registry reopen,
additive (DEC-314 to 317). render-default.spec.ts restated. FINDING it left: the send-in's "readable" check still
reads doc.seen (the browser's colours). Full run 1583 passed, 0 failed.
Attack (each PASS or FAIL with what you saw; a secret leak or a second charge is a BLOCKER):
 - The secret: every way a sealed-or-about-to-seal wish can end with an opening that needs a secret and no hash:
   seal then change the opening (may a sealed wish change its opening? what happens to the hash and the gate);
   staff edits; a wish copied or made again from another; a kind or occasion change that swaps the opening; the
   group and business paths; two saves at once (one sets, one clears) then a seal; passcode "" or spaces; the
   answer " " ; unicode case (İ, ß), a 64-character answer with spaces. A wish sealed BEFORE this change with no
   hash and a passcode opening (make one by SQL): what does its link do?
 - Old secrets after IK2: a question answer hashed BEFORE this change (as typed, mixed case): does the right answer
   still open? (No real rows exist; say what the code does.)
 - Unlock: the right answer in another case opens; wrong tries still count and lock (10 an hour per address, 30 lock
   the link); the unlock token of one wish refused on another; no response, log line, audit row, notice or job
   payload holds the secret or its hash.
 - The video extra (money): with no renderer every way to pay for it is refused BEFORE a payment row or a provider
   call (the wish page start, a bundle or a ticket that includes it, a business or Concierge order, a staff grant):
   list each route. With the stand-in: twenty starts at once for one wish: one payment; a webhook replayed; the
   extra refunded (IJ3) then asked for; the download address after 10 minutes, with another person's session, for a
   wish whose owner was erased; a failed job asked again twenty times at once: one job.
 - The Studio: a document the web's editor really makes (take three from the repo's seed styles and the specs),
   then each field one step wrong; an approved live style edited to a bad base; an OLD draft row holding an unknown
   base (SQL): does it still read, play and save?
 - The contract: the registry diff is additive only (no field renamed, removed or retyped narrower); check-contracts,
   check-drift, check-routes; the migration list unchanged (no new migration: confirm).
Then: typecheck, the WHOLE lint, scripts/gates.sh, and `WEB_LIB=/nonexistent/lib npm test -- --maxWorkers=2` once.
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-19/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by
severity with file:line. Drop your databases, remove your worktree. Hand back ONCE in 15 lines.
