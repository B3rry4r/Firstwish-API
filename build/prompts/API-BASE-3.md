BUILDER API-BASE-3 | TIER T2 identity and the wish | Budget 120 steps. Five named items; change nothing else.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, rulings HM1, HM3, HM4, HM6 in build/rulings-phase3.md, build/sweeps/api.md, and how
API-BASE-2 reopened the registry (build/prompts/API-BASE-2.md; tools/pipeline/reconcile.py --reopen, freeze.py, show.py;
scripts/check-contracts.mjs). ONE reopen for all registry changes here, decisions citing the ruling ids, reconcile twice
identical, freeze; ids already issued never change.
Work: /home/user/Firstwish-API, local branch `api-base-3` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-3 (`npm ci`, prisma generate); ports 5200-5209; TEST_DB_PREFIX=ab3. Never commit on claude/sleepy-mayer-f0hkb8
itself. Do not edit a gate or a baseline; an older test changes only where a ruling makes its expectation wrong (name
each line and why; HALT if unsure).
Cases (through the real routes):
 1. HM1: GET /v1/wishes/:id returns makerNote exactly as the contract types it (find why the wire shape omits it; check
    every route whose contract carries makerNote); what PATCH saved is what GET gives back; another person never sees it;
    erase rules still cover it (the AA2 gate).
 2. HM3: POST /v1/wishes takes an Idempotency-Key (registry: the header on that endpoint, as other writes have it): the
    same key twice, and 10 at once, answer the SAME draft (one row); a different key makes another. A person with an
    untouched draft gets that draft back (200, the same id) instead of a new one; a start that carries a kind or style
    makes or fills as the ruling says; a touched draft is never handed back. Say how "untouched" is known (a column or a
    derived test) and prove it with a draft touched then cleared.
 3. HM4: Wish.content is an object type in the registry and the contracts file (find why the generator emits text for a
    parent with named children; fix the registry entry or the generator, whichever is wrong; say which other fields had
    the same fault and fix them the same way). No change on the wire: prove with the contract tests.
 4. HM6: a refresh with NO cookie (and a malformed cookie) answers 401 with error code no_session; an ended, reused or
    erased session keeps its code and words. Staff refresh the same. Registry/conventions: the code is listed where
    error codes are.
 5. Stand-in mail file (sweeps/api.md): created with mode 0600; a path that is a directory or cannot be written is a
    clear config error at boot, not a throw at send time.
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, gates.sh, check-contracts, check-drift, check-routes,
the affected specs, then `npm test -- --maxWorkers=2` twice (name any failing test). Commit on api-base-3; do not push;
remove your worktree and databases. Hand back in 10 lines of claims (one per line, each testable): head, DEC ids, each
case closed or not with file:line and the test's name, any older test line changed and why, NOT RUN.
