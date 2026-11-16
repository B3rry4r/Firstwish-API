BUILDER API-BASE-6 | TIER T2 | Budget 220 steps. What the receiver, the business screens and the maker still need; change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HS1-HS3, HR1, HR3-HR5, HA1, HA2, HQ4 in build/rulings-phase3.md, the list
build/sweeps/api.md (the section "For API-BASE-6") and how API-BASE-5 reopened the registry (build/prompts/
API-BASE-5.md). ONE reopen for all registry changes here, decisions citing the ruling ids, reconcile twice identical,
freeze; ids already issued never change; `.pipeline/ui-align-tasks.json` must come out byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-6` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-6 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab6. Never commit on claude/sleepy-mayer-f0hkb8
itself; work ONLY inside your worktree. Do not edit a gate or a baseline; an older test changes only where a ruling
makes its expectation wrong (name each line and why; HALT if unsure). A test that needs its own prices or settings
makes its own (never change shared rows other specs read).
Cases (through the real routes; a test for each; in this order: if the budget runs out, hand back the rest by number;
wait for your own test runs to finish before you hand back):
 1. HS2 keep and wake by link: the public wish view gives what a keep or wake start needs; the link holder (HA1
    headers: the link, the unlock token where there is a passcode, the signed proof) starts a keep or a wake payment
    with no account and reads its result back; a resting wish's link answers its "resting" state (no content) with
    the wake on offer; ended, removed, taken down, erased: 410 as now. A wish under its maker's Pass: as HA2 says.
    Attacks: no proof, another wish's proof, a passcode wish with no unlock, two payments at once (one keep), a wake
    of a wish that is not resting.
 2. HR1 plans: GET /business/plan gives, for each plan on offer, what a payment now would do (adds a month to which
    day; replaces the live plan from now and what becomes of the time already paid); a second plan start while one
    of the business's plan payments is pending answers 409 with words and the pending payment's reference (so the
    screen can carry on with it); packs may be bought more than once. An "I left" call is NOT added: a start for the
    same plan while one is pending hands back that pending payment (say what the code does today and keep or make
    it so).
 3. HR3 logins: the person's own read (/me) carries the businesses they are a login of (id, name, the login's
    state) beside the business they own; a removed login's business reads answer 403 with words that say so.
 4. HS1 the gather link: the friend's side (read who is asking, add one voice note by the signed put, the friend's
    first name) with no account; the owner's side (each voice as it arrives, remove one, turn the link off); limits,
    screening, the count against 12; nothing else of the wish readable through the link. A draft's gather link reads
    (it answered 404 before the seal).
 5. HS3 house wishes: one per style that is on, seeded from the style's package with house content marked as the
    house's, published by the house creator; the styles read gives its link; rerunning the seed makes no second
    one; turning a style off unlists its house wish.
 6. Staff reads typed as the server answers (API-BASE-5's case 6: payment detail, refund, ledger, business, wish,
    person, creator, moderation, showing; the web's lib/admin/w13-api.ts and c-live.ts on its branch claude/sleepy-mayer-f0hkb8 list the
    view types it had to declare). The registry is corrected, not the wire.
 7. Small: HR4 the client-wish read gives the day a removed draft's wish returns to the pack; HR5 the people import
    answers per row (accepted, or refused with the field and words; a phone that is not one is refused; the same
    person twice is reported); a signed read for a brand logo; the payments module writes a reason on a failed
    payment; ending-purposes rows carry a display name and a line; the wish read's pictures carry the server's words
    for a refused photo; opening-defs carry a slug; GET /business/plan typed as it answers (E-27).
Checks (quiet logs, EXIT lines): typecheck, eslint on every changed file (0 errors on a fresh `npm ci`), gates.sh,
check-contracts, check-drift, check-routes, the affected specs, then `npm test -- --maxWorkers=2` twice (the
reference-data "seed equals the web app's own files" test may fail here when the web checkout has moved: report it
apart). Commit on api-base-6; do not push; remove your worktree and databases; leave no background jobs. Hand back
ONCE in 12 lines of claims (one per line, each testable): head, DEC ids, each case closed or not with file:line and
the test's name, any older test line changed and why, NOT RUN.
