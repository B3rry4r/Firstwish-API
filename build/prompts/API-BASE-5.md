BUILDER API-BASE-5 | TIER T2 | Budget 220 steps. What the maker's content screens and the staff screens found; change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HQ1-HQ5, R14, FC1 in build/rulings.md and build/rulings-phase3.md, the lists
build/sweeps/api.md (the sections "From W13's verifier" and "From API-BASE-4's verifier") and how API-BASE-4 reopened
the registry (build/prompts/API-BASE-4.md). ONE reopen for all registry changes here, decisions citing the ruling
ids, reconcile twice identical, freeze; ids already issued never change; `.pipeline/ui-align-tasks.json` must come
out byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-5` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-5 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab5. Never commit on claude/sleepy-mayer-f0hkb8
itself; work ONLY inside your worktree. Do not edit a gate or a baseline; an older test changes only where a ruling
makes its expectation wrong (name each line and why; HALT if unsure).
Cases (through the real routes; a test for each; in this order: if the budget runs out, hand back the rest by number):
 1. HQ3 uploads on a test stack: the stand-in storage RECEIVES the signed put (the same middleware family as its
    signed read: only with PROVIDERS=standin, never in production; a put with a bad, expired or borrowed signature,
    over the size the upload was asked for, or of another content kind is refused); then confirm really checks the
    stored object (size, kind) and screening runs on it; the bytes read back through the signed read are the bytes
    put. The stand-in AI answers in the contract's shape for each AI route (so "answered" is real on a stack).
 2. HQ1 the maker's fields: the contract's wish content gains what the maker's designed screens collect and the
    contract lacks: the cover's school, years and born; letter.line; reasons.note; memory.quote; blessing.note;
    links.download (check each against the web's maker on its branch: /home/user/Firstwish-web, `git show w5-maker2:lib/draft.ts`
    lists what it maps and what it drops, and the maker BEFORE the wiring, `git show c223c96:components/app/maker/Fields.tsx` or wherever the steps' fields live, shows which inputs the design drew; add only fields a designed screen collects); saved, read back, length-bounded,
    covered by the erase rules (the AA2 gate) and shown to the receiver only where the wish's player uses them.
 3. HQ4 the gather link: the wish's owner (a person, not only a business) can read the link friends use to add a
    voice (find the business-only read: GET /v1/wishes/:id/link or as the registry names it) and what a friend's
    visit may do; another person: 404.
 4. HQ5 styles by ticket: the server refuses a style above what the wish's ticket allows, on the draft's PATCH once a
    ticket is chosen and at the seal, with words; a read tells the maker which styles the current ticket allows (on
    the styles read or the wish read: say which). Find the rule in the price book and seed (levels: starter,
    standard, premium against tickets) and in rulings; if no rule is recorded, HALT on this item with what you found.
 5. Staff, money (R14): PUT /admin/prices takes the payout DAY as well as the threshold; a read of the price book's
    versions (who, when) for owner, ops and finance; the payments list takes a state filter; the businesses list
    takes a search. Staff acts that repeat (erase an erased person, take down a removed wish, a second ban of the
    same scope) answer 409 with words. Staff wish search: the number without case, an email fragment.
 6. Staff reads say what they send: the contract's staff payment detail, refund, ledger, business, wish, person,
    creator, moderation and showing reads are typed as the server answers (today unknown[] or row-shaped: the web
    re-declares about 30 view types: /home/user/Firstwish-web `git show w13-staff3:lib/admin/w13-api.ts` and
    `git show w12-staff2:lib/admin/c-live.ts` list them). The registry is corrected, not the wire.
 7. Small: ending-purposes rows carry a display name and a line (not the slug in `name`); a server limit on the
    voice-note count per wish; the Clock port (not the database's now()) in notices.service.ts:216-224 and
    vault/reveals.service.ts:168; an account's own erase and a staff erase: say what waiting period the rulings give
    and whether the code follows it (no change without a ruling: report).
 8. The receiver's keep and wake by link (rulings HA1, HA2; found by W7): today the public wish view has no handle
    the keep and wake routes accept (they take the wish's UUID and say "signed in") and a resting wish's link answers
    410, so a receiver can never wake it. The link holder (the link, and the unlock token where the wish has a
    passcode, in the HA1 headers) can read a resting wish's "resting" state at its link (no content) and can start a
    keep or a wake payment for it with no account (by the slug or a handle the public view gives); an ended, removed
    or taken-down wish stays 410. The public view also carries weddingDate where the player needs it.
 9. House showcase wishes (the supersedes entry "house showcase wishes served by the server"; found by W7): each
    style has a house wish that plays it, published by the house creator and seeded, and the styles read gives its
    link (showcaseSlug or as the registry would name it), so "Watch it play" on a style opens a real wish at
    /w/<slug>. Say how many styles the seed can cover from prisma/seed-data today and what is missing.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-drift, check-routes,
the affected specs, then `npm test -- --maxWorkers=2` twice. Commit on api-base-5; do not push; remove your worktree and
databases; leave no background jobs. Hand back ONCE in 12 lines of claims (one per line, each testable): head, DEC ids,
each case closed or not with file:line and the test's name, any older test line changed and why, NOT RUN.
