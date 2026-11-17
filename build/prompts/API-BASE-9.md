BUILDER API-BASE-9 | TIER T2 | Budget 220 steps. What the Vault and Concierge still need from the server; change nothing else.
Machine: 4 CPUs, 15 GB. THE MACHINE RESTARTS WHEN OVERLOADED: run ONE heavy job at a time (never two jest runs, never
jest beside a build), and commit your work in progress on your branch at every closed case. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings IA1, IA4, IB1-IB6, HZ2, HU5, ZB3, EB1, HF1, HJ1 in build/rulings-phase3.md, the
list build/sweeps/api.md (the section "For API-BASE-9" and the API-BASE-9 rows below it) and how API-BASE-8
reopened the registry (build/prompts/API-BASE-8.md). ONE reopen for all registry changes here, decisions citing the
ruling ids, reconcile twice identical, freeze; ids already issued never change; `.pipeline/ui-align-tasks.json`
must come out byte for byte as it went in.
Work: /home/user/Firstwish-API, local branch `api-base-9` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-9 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab9. Run every command with your
own worktree as the working directory; never commit on claude/sleepy-mayer-f0hkb8 itself. Do not edit a gate or a
baseline; an older test changes only where a ruling makes its expectation wrong (name each line and why). A test
makes its own rows, its own style and prices where it needs them, and counts only its own (the suite shares one
database across workers). No deferral phrasing in src comments.
Cases (through the real routes; a test for each; in this order; if the budget runs out, hand back the rest by number):
 1. IA4 (HIGH, identity): a reveal's passcode holds for every link to those files: copy-link after a passcode
    reveal never returns a way in without it (today it mints a second link with none). Attacks: every route that
    returns or makes a link for a shoot, a reveal or a client wish.
 2. IA1 (money: pack wishes are paid): ONE call sends a reveal: it makes the client wish and the reveal together or
    neither (one transaction), takes one wish from the pack, sends one email, and is idempotent by its key; a shoot
    already revealed to that client answers 409 already_sent with when and the link unless the body says again;
    the two older calls keep working for older clients. Attacks: 30 identical calls at once (one wish, one reveal,
    the pack down by one); a refused email (nothing taken); the pack empty; a lapsed plan.
 3. IB6: a live login gets Vault upload tickets; a removed login and another business's login do not.
 4. IB1: favourites at the reveal link (mark, unmark, read) and the business's read per reveal and per shoot
    (the hearts the screens draw: UA-831, UA-976); the limits; nothing before the passcode.
 5. IB2: download addresses for finals at the link when downloads are on; the switch on the reveal; never a proof.
 6. IB3: rename a shoot and a file (the business and its live logins; another business: 404).
 7. IB4: a reveal with a named subset of files; a file of another shoot or not ready: 422 with words.
 8. IB5: the first play sets openedAt; plays counted; the shoot read carries them (UA-832).
 9. HZ2 (Concierge, T-12): "make the wish" on an order: the order's maker (or the owner) makes a wish in the
    buyer's name through the order; it is the buyer's, tied to the order, hidden from the buyer and every list of
    theirs until delivered; the maker edits it through the same wish routes while the order is being made and
    loses that the moment it is delivered or the order moves to another maker; delivery takes the tied wishes
    (the typed-ids path stays for older orders); the maker's list (E-270) shows the tied ones. Attacks: a maker on
    a wish of another order, of the buyer's own; the buyer reading it before delivery; cancel and refund of the
    order with a wish half made (the wish goes); erase of the buyer.
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, scripts/gates.sh, check-contracts, check-drift,
check-routes, the affected specs, then `WEB_LIB=/nonexistent/lib npm test` twice in a row with 0 failed. Commit on
api-base-9; do not push; remove your worktree and databases; leave no background jobs. Hand back ONCE in 12 lines:
head; each case closed or not with the test's name; new endpoint and decision ids; totals; what you could not do.
