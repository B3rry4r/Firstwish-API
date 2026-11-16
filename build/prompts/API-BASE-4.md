BUILDER API-BASE-4 | TIER T2 | Budget 190 steps. Ten named items the wiring found; change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HP1-HP8 (and HN1, FC1, HA1) in build/rulings-phase3.md, and how API-BASE-3
reopened the registry (build/prompts/API-BASE-3.md). ONE reopen for all registry changes here, decisions citing the
ruling ids, reconcile twice identical, freeze; ids already issued never change; `.pipeline/ui-align-tasks.json` must
come out byte for byte as it went in (restore it if reconcile rewrites it).
Work: /home/user/Firstwish-API, local branch `api-base-4` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-4 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab4. Never commit on claude/sleepy-mayer-f0hkb8
itself. Do not edit a gate or a baseline; an older test changes only where a ruling makes its expectation wrong (name
each line and why; HALT if unsure).
Cases (through the real routes; a test for each):
 1. HP1: the staff me read and GET /v1/admin/team carry the role's sections (RoleAccess as the contract has it), for
    every role and for a member with two roles; they equal what the section guard enforces (one source in code).
 2. HP2: PATCH /v1/wishes/:id: an occasion the kind does not have, an unknown occasion, a step below 0 or past the
    last: 422 naming the field; the valid ones still save.
 3. HP3: the owner's wish read (single and list) gives a signed read url with a short life beside the cover's and each
    photo's id; another person never gets one; a refused or still-screening photo gives none (say what it gives); the
    stand-in storage's url really serves the bytes on a stack.
 4. HP4: the registry and contracts say what the server sends for the link read ({link, slug}), Wish.no (nullable) and
    the wish's state values; no change on the wire; list every contract type that moved.
 5. HP5: the wish read carries the video's state; GET /wishes/:id/video keeps its answers.
 6. HP6: STANDIN_CLOCK_OFFSET (seconds, may be changed while running through the same means the stand-ins use, or read
    at boot: say which) moves the Clock port's now; refused at boot with NODE_ENV=production or PROVIDERS=live; with
    it a wish reaches resting, ended and the restore window's end through the real jobs. In .env.example and
    .pipeline/env-manifest.json.
 7. HP7: a team member's change carries the version it saw (registry: the field or header, as other versioned writes
    have it); two at once: one 200, one 409 with words. HP8: removed staff are left out of the Team read by default.
 8. HP9: each row of GET /v1/showing (and the creator's wishes) carries the viewer's own mark: {reaction, saved} when
    signed in (so a heart and a save survive a reload), nothing for a visitor. HP10: the contract matches the server
    for: the follow routes' body (E-57, E-58: the server refuses a body `handle`; the registry lists one), the react
    answer ({reaction, wish}), PublishedWish.creator ({handle, name}), PlayWish.wish and data, and the loose fields
    the web had to cast (lib/person.ts on the web branch w3-app lists ten named casts with the request beside each:
    read them: /home/user/Firstwish-web, `git show w3-app:lib/person.ts`). No change on the wire unless a ruling says so.
10. HP12 (staff, from W13): GET /v1/admin/people also searches by wish number; staff who may moderate get a signed,
    short-lived read url for a held photo on the moderation item (never for other roles; in the audit); a read of the
    wish-of-the-day picks for today and the next 6 days; the creators list carries each creator's payout months and
    which are due. Each as the registry would shape it (one reopen with the rest).
 9. The two low lines in build/sweeps/api.md under "For the next API base": the stored makerNote is bounded (not
    only the incoming one) and a body nested too deep is 422, never 500.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-drift, check-routes,
the affected specs, then `npm test -- --maxWorkers=2` twice (the reference-data "seed equals the web app's own files"
test may fail here when the web checkout has moved: report it apart, do not touch it). Commit on api-base-4; do not
push; remove your worktree and databases. Hand back ONCE in 12 lines of claims (one per line, each testable): head, DEC
ids, each case closed or not with file:line and the test's name, any older test line changed and why, NOT RUN.
