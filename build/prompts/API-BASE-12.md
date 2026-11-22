BUILDER API-BASE-12 | TIER T2 | Budget 150 steps. What the business, Studio and public screens reported missing on the server; change nothing else.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`
except the final full runs, and a commit on your branch at every closed case. Stop only PIDs you started. If the
branch, worktree or a NOTES.md already exists, an earlier agent was lost: read git log and carry on.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HR3, HU5, HW2, IF2a, IF4a, IE1 in build/rulings-phase3.md, the lists in
build/sweeps/api.md (the rows dated 22 Nov) and how API-BASE-11A reopened the registry (build/prompts/API-BASE-11A.md).
ONE reopen for all registry changes here, decisions citing the ruling ids, reconcile twice identical, freeze; ids
already issued never change; `.pipeline/ui-align-tasks.json` byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-12` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-12 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab12. Run every command with
your own worktree as the working directory. Do not edit a gate or a baseline; an older test changes only where a
ruling makes its expectation wrong (name each line and why). Test rows use test/kit/unique.ts, test/kit/own-db.ts
and uniqueAddress(). No deferral phrasing in src comments. Run the two final full-suite runs in the FOREGROUND of
one command (or wait on a marker file): do not hand back while they run.
Cases (through the real routes; a test for each; in this order):
 1. One person, two businesses (identity and money): the people routes, the business payment starts and reads
    (plan, pack, invoices) and the brand uploads act on the business named by the x-business-id header, with the
    caller's role THERE (owner or login), exactly as the other business routes already do; no header: as today.
    Attacks: a business the caller is not in (404), a login trying owner-only acts there (403), an owner of A who
    is a login of B paying B's plan (refused in words), the header in upper case, a non-id (IF2a: 422), a plan
    payment started for B never lands on A (ledger and plan rows).
 2. Studio files: a signed, short-lived read address for a creator's studio file (a picture, a poster, a sound, a
    3D model) and for a profile picture, for the creator, and for the public where the style is approved and the
    file is part of it; if the routes already exist, write the spec that proves them and change nothing.
 3. A creator's styles follow the account: a migration gives creatorId to every style whose creator JSON has a
    handle and no creatorId, where that handle belonged to that creator when the style was made (the house
    styles too, if the seed writes them so: fix the seed data's shape as well); a handle that matches nobody is
    left and listed in the hand-back. After it E-285 lists the older styles under the right creator.
 4. The stand-in can hold a file in "screening" and can reject it, by a test-only setting the live stack can turn
    on per file name (so the screens' screening and refused states can be driven); never on in production: prove
    the setting is refused when PROVIDERS is not standin.
 5. Lows: a published row is dropped when a Concierge wish is delivered (the buyer publishes it themselves);
    `confirmation` is present (null) on every staff Prices line; support_contact_key rows older than 30 days are
    swept by the existing cleanup job; a webhook whose reference differs only in case settles the same payment.
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, scripts/gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test` twice in a row with 0 failed. Commit on
api-base-12; do not push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 10 lines:
head; each case closed or not with the test's name; new endpoint and decision ids; totals; what you could not do.
