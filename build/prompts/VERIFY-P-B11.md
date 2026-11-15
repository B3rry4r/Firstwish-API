VERIFIER P-B11 | TIER T1 lean, re-check by ruling id | Budget 40 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/P-B11.md, rulings KK1-KK6 in build/rulings-phase3.md, and
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b11/VERDICT.md (round 1).
Under test: local branch `p-b11` (head 5e870b7) of /home/user/Firstwish-API; base local branch int-3 (a9c8695). Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/vp-b11 (detached at the branch; `npm ci`); ports 4620-4629; TEST_DB_PREFIX=vpb11 for every run; remove both when done.
Known and NOT a finding: build and typecheck fail on src/modules/purchases/grants.ts(84), another bundle's file being fixed
(typecheck the notices module's own files only; say if any OTHER file fails). The in-flight state is stored as "sent" and a
dropped delivery as undeliverable with a "Dropped" reason until the enum gains the values (ruling MM1).
With your OWN script on createTestApp, the clock port, the email stand-in and a counting provider, say CLOSED or OPEN:
 KK1: the job tick and deliverNow started at the same moment, 30 rounds: exactly one provider call each round. 50 deliver calls
      at once against a provider that always fails: one call per try, 3 in all across the retries (move the clock 1 and 5
      minutes), then failed for staff, never a 4th. A caller that dies mid-try (the claim taken, no result): picked up again
      after the stale time, still at most 3 calls in all. Two workers and the tick together: the same.
 KK2: wording with a 151-character subject, a 4,001-character body, a tag, a zero-width character, a control character: 422 each.
 KK3: a value with CR LF in a subject goes out as one line; the same in a body keeps its line break.
 KK4: the staff delivery log (JSON) holds no full email address anywhere. KK5: an erased account's queued deliveries end dropped
 and nothing is sent. KK6: a stored provider error holds no six-digit code.
Round 1 again: 30 sends with one key: one row, one email; send again 10 at once: one; 09:00 in Lagos, Tokyo, Los Angeles.
Also: the diff touches only src/modules/notices. Checks (quiet logs, EXIT lines): lint on the module, gates.sh, check-contracts,
`npm run test:affected -- src/modules/notices` twice.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/b11/VERDICT-P.md (25 lines or fewer). Hand back in 10 lines or fewer: verdict merge or fix; each OPEN id with
file:line; what you did not run.
