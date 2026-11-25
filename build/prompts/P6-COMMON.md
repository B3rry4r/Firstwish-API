PHASE 6 COMMON (every wiring builder reads this once; 40 lines or fewer)
Built on W0b (merged 16 Nov): lib/api.ts, lib/session.ts, lib/contracts/, scripts/live/{stack,drive,auth-flow,standin}.mjs,
`npm run test:client`, `npm run contracts:check`. Read lib/api.ts and lib/session.ts before writing a line.
Read: /home/user/Firstwish-API/build/common-rules.md; /home/user/Firstwish-API/build/tasks/PHASE6.md; /home/user/Firstwish-API/.pipeline/conventions.md (auth, error
envelope, format canon, Runtime contract); /home/user/Firstwish-web/AGENTS.md, .pipeline-ui/invariants.md, .pipeline-ui/surface-map.json;
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/frontend-surface-build/SKILL.md (Core laws, Phase 5) and
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/SKILL.md (Phase 6). Per screen: the fragment
/home/user/Firstwish-API/.pipeline/fragments/<screenId>.json, its open tasks in .pipeline/ui-align-tasks.json (screenId) and its stubs in
.pipeline/stubs.json; endpoints by `python3 tools/pipeline/show.py <Resource>` in /home/user/Firstwish-API; rulings in build/rulings.md (R1-R17)
and build/rulings-phase3.md.
Owner's rules: nothing stored on the browser (R10: no localStorage, sessionStorage, IndexedDB, no cookie written by the page);
every message by email (R11); no native browser control (use components/app/pick.tsx); no dead control and no placeholder: a
part the server cannot serve yet is not drawn; no fixture, sample or made-up value on a live path (the AI is never faked);
words: "kind" (never format, category, type), Portrait and Landscape, none of forever, launch, coming soon, abroad, diaspora;
no emoji; money is integer kobo from the server, shown with the client's formatter.
Shared modules are IMPORT-ONLY: lib/api.ts (the one client), lib/session.ts (the person's session), lib/contracts/
firstwish-contracts.d.ts (never hand-edited; no wire shape typed by hand anywhere), components/app/pick.tsx. If you need a
change in one, or in a file outside your file map, do not make it: list it under REQUESTS in the hand-back.
Wiring means: the screen reads and writes only through lib/api.ts; every state is real and reachable (loading, empty, error
with the server's own words, signed out, not allowed); a write shows its result from the server's answer, never from a
guess; a 409/422/402/403/429 each shows what the server said; double taps send one request (Idempotency-Key on writes that
take one); every fixture import, sample array and memory-only stand-in for these screens is REMOVED in the same commit.
Work: the WEB repo /home/user/Firstwish-web, your branch from ccr-91b3ed11-fx445c in your own worktree (`npm ci`); never commit on
ccr-91b3ed11-fx445c; the API through `node scripts/live/stack.mjs` (API_DIR = your own detached API worktree with `npm ci`; live checks
run on a BUILT web, origin 127.0.0.1:PORT). Do NOT edit scripts/gates/, its baseline.json, or the API repo: an API gap is
a HALT line in the hand-back (the endpoint, what the screen needs, what it gives).
Measure in a real browser on the built web against the stack, numbers not adjectives, to your measure file: each screen at
360x740, 390x844, 1440x900: scrollWidth <= innerWidth AND each control inside its own cell (its right edge against its
container's); 0 console errors; every state reached; a value that exists only on the server seen on the screen; after a
reload the screen shows the same server data; storage as the page sees it is EMPTY; one light and one dark picture per
screen at 360 (and one per extra state of a pay screen) into your pictures folder. The live driver: your steps go in
your OWN new file scripts/live/flows/<bundle>.mjs (reaching each screen through the real screens, as auth-flow.mjs does);
in drive.mjs add only one import line and one call line for it. .pipeline-ui/wired.json is the lead's: list your screens
in it locally to see your count, but do NOT commit that file (name the screens in the hand-back). Sign-in codes: use
scripts/live/standin.mjs as it is (the lead is replacing the planted code with a file the API writes; do not rework it).
Checks (quiet logs, EXIT lines): typecheck, lint, check:css, `npm run gates` (exit 0, no new finding), `npm run build`,
`npm run test:client`, the live driver. Commit on your branch; do not push; remove your worktrees, stack and databases.
Hand back in 14 lines or fewer: head; claims one per line, each testable; ui-align ids done / not done with why; stale
baseline ids; REQUESTS; HALT lines; NOT RUN / NOT MEASURED.
