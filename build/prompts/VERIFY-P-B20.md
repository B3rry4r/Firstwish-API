VERIFIER P-B20 re-check | TIER T1 | Budget 22 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, rulings DA1-DA4 in build/rulings-phase3.md, the first verdict
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b20/VERDICT.md and its spec /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b20/vb20.spec.ts.txt (reuse it).
Under test: local branch `p-b20` (head 5e8ac38) against `b20-support` (dc958e3): `git diff b20-support p-b20` is all you check.
Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-pb20 (detached at p-b20; `npm ci`); TEST_DB_PREFIX=vpb20; a clock in 2193; remove both when done.
Check by id, each PASS or FAIL with what you saw:
 DA1/DA4  mail from the sending address, a reply+ address, mailer-daemon and postmaster on another domain, an empty sender, a
      multipart/report from an ordinary sender, each with and without Auto-Submitted: no thread, no message, no email back.
      A real person on the same mail domain still gets a thread. A display name or a Reply-To that differs from the sender
      cannot make own mail look like a person's (try three shapes). A staff reply to an own-address thread is 422.
 DA2  after a complaint, the address in another case and with a +tag gets no email of any kind but the sign-in code; another
      address is untouched; the complaint list holds no readable address.
 DA3  "whsec_" and a blank secret are 503; the 31st message by one token in a day is refused and stored nowhere, 40 at once
      land exactly 30, the next day starts again, and another thread's token is not slowed.
 Also: the first verdict's "held" list still holds (run the old spec; say what changed).
Checks (quiet logs, EXIT lines): typecheck, gates.sh, `npm run test:affected -- src/modules/support src/modules/notices` once.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b20/VERDICT-P.md (20 lines or fewer). Hand back in 10 lines or fewer: merge or fix; findings by severity with file:line.
