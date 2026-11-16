VERIFIER API-BASE-6 | TIER T2 money and identity, full | Budget 130 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/API-BASE-6.md (its cases 1-5 and 7 are the contract; case 6 was handed
back), rulings HS1-HS3, HR1, HR3-HR5, HA1, HA2, NN1, NN6 in build/rulings-phase3.md, and the claims in your spawn line.
Under test: /home/user/Firstwish-API, local branch `api-base-6` (head in your spawn line) against claude/sleepy-mayer-f0hkb8. Your own detached
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab6 (`npm ci`, prisma generate); ports 5210-5219; TEST_DB_PREFIX=vab6. Probes as specs under
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab6/ (not in the repo). Remove your worktree and databases when done; leave no jobs.
Attack through the real routes (each PASS or FAIL with what you saw). In this order:
 - The link holder with no account (HS2). Privacy: a resting wish's link answers 200 "resting": read the whole answer:
   no letter, caption, photo or voice url, sender detail beyond what a countdown shows; ended, removed, taken down,
   erased: still 410 (the builder REMOVED older 410 expectations in public-wishes.contract.spec.ts and changed
   public-wishes.rulings.spec.ts: read those diffs line by line: was any protection dropped, or only resting moved
   to 200? "read and unlock answer 200 after the end" is what the builder wrote: after WHICH end, and what do they
   carry?). Money: a keep and a wake started by the link (no proof, another wish's proof, a forged proof, an expired
   one, a passcode wish with no unlock, the right ones); two starts at once (one payment); pay, fail, leave; the result
   read back only with the same proof; the price equals the price book; a wish under its maker's Pass (what the
   holder is charged and why); a wake of a wish that is not resting; a keep of a wish already kept to the top term.
   Identity: "a guest payer account is made from the email sent": what is it? Can anyone sign in to it; what if the
   email already has an account (is the payment tied to that account without its owner signing in; can a stranger
   learn the account exists; can a stranger attach payments or anything else to someone's account); is the email
   verified; what erases it; does it count as a customer anywhere (numbers, staff People). An account made or
   touched for an email without proof of owning it is a finding: say how bad.
 - Plans (HR1): the per-plan "what a payment now would do" equals what really happens after paying, for same plan,
   up, down, with a pack, with none (5 cases: the days exact); a second plan start while one is pending: the same
   plan hands back the pending payment (one row), another plan is 409 plan_payment_pending with the reference; after
   the pending one is paid, failed or closed by the sweep a new start works; packs repeat; 10 starts at once.
 - Logins (HR3): /me carries the businesses a person is a login of, never another business's; a removed login: 403
   login_removed on every business read (list them) and their /me no longer lists it.
 - The gather link (HS1): a friend with the link and no account: reads who is asking and for whom (first names
   only: read the answer for anything else of the wish); adds ONE voice note by the signed put with a first name;
   the limits (size, kind, 12 per wish, one per visit or as the code says), screening before the owner hears it;
   another wish's link; a turned-off link; an opened, ended, removed wish; the owner sees, removes, turns off;
   abuse: 50 adds from one address (what stops it?), a name of 200 characters or with markup, no name.
 - House wishes (HS3): one per style that is on; marked as the house's in every read (never a person's); the seed
   run twice makes no second; a style turned off: its house wish 410 and gone from /v1/showing if it was there; the
   house wishes do not count in staff Numbers, payouts or royalties, and cannot be reported, kept or woken for money.
 - Small (case 7): each item by one probe: returnsToPackOn equals what the window job does; the import's rows (a
   bad phone refused with the field; a bad date refused; the same person twice reported; nothing stored blank);
   the brand logo's signed read (owner and logins only); a failed payment's reason; ending-purposes and opening-defs
   carry slug, name, line; a refused photo's reason on the owner's read only.
 - The migration applies on a database at the base head with wishes; additive; check-drift clean. Registry: DEC-235
   to DEC-241, E-257 to E-265 the only endpoints added, ui-align-tasks.json byte-identical; every contract type that
   moved. Every older test line the builder changed: read each: only what a ruling changed.
 - `npm test -- --maxWorkers=2` once (the builder: 136 suites, 1281 tests, twice); gates.sh, check-contracts,
   check-routes, eslint on the changed files; spec file count against the base.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/ab6/VERDICT.md (40 lines or fewer). Hand back ONCE in 18 lines or fewer: merge or fix; findings
by severity (blocker, high, medium, low) with file:line; what you could not run.
