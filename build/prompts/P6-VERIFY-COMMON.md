PHASE 6 VERIFY COMMON (every wiring verifier reads this once). You did not build this. Test, do not trust. You fix nothing.
Read: /home/user/Firstwish-API/build/common-rules.md; /home/user/Firstwish-API/build/prompts/P6-COMMON.md (what the builder was held to); the bundle's
builder brief (its cases are the contract); the builder's claims (your spawn line) and its measure file; /home/user/Firstwish-API/.pipeline/
conventions.md (auth, error envelope); rulings R10, R11 in /home/user/Firstwish-API/build/rulings.md;
/home/user/Firstwish-API/build/handover/skills/frontend-surface-build/SKILL.md (Core laws 2, 4, 7, 8, 9; Phase 5).
Set up: your own worktrees (web: detached at the branch under test, `npm ci`; API: detached at the commit in your spawn
line, `npm ci`), the stack through `node scripts/live/stack.mjs` with API_DIR and your prefix, a PRODUCTION web build
(`--built`; origin 127.0.0.1:PORT). Sign-in codes: scripts/live/standin.mjs. Kill what you start by PID; remove your
worktrees, stack and databases when done. Never a live provider or a production host.
Every bundle, each PASS or FAIL with what you saw (numbers and quoted words, not adjectives):
 - R10: after using every screen of the bundle (reads, writes, a reload, sign-out): localStorage, sessionStorage,
   indexedDB.databases() and document.cookie as the page sees them are EMPTY at every step (print them); grep the bundle's
   own files for any browser store, fixture, sample or made-up value on a live path (list file:line).
 - Real data: for each screen, a value that exists only on the server (make it through the API, not the screen) shows on
   the screen; a write made on the screen is in the server's row; a reload and a second browser profile show the same.
 - States: loading, empty (a new account), error (stop the API: the designed error and a retry that works when it is
   back), signed out (the link lands on sign-in and returns), not allowed (another person's id: no data of theirs).
 - The server's words: each refusal the bundle can meet (409, 422, 402, 403, 429) shows what the server said, on its
   field where it names one (quote server and screen side by side); nothing made up.
 - Double submit: two fast taps on every write send one request (count them); a retry repeats the same Idempotency-Key.
 - No dead control: every button, link and menu item on each screen does something real or is not drawn (tap each at
   360; list any that does nothing); no native browser control; no banned word, emoji, "format/category/type" for kind.
 - Width and fit at 360x740, 390x844, 1440x900, light and dark, every screen and state: scrollWidth <= innerWidth AND
   every control inside its own cell (its right edge against its container's; a popup inside the viewport); text that
   wraps or truncates in a button or field (list it); 0 console errors; hover and focus-visible exist on each control
   kind (measure the change); keyboard reaches every control in order.
 - Pictures: one light and one dark per screen and per extra state at 360 into your pictures folder: OPEN at least six
   yourself and say what each shows; the lead and the owner look at all of them.
 - Law 4: no response shape typed by hand in the bundle's files; `npm run contracts:check`; `npm run gates` exit 0 with
   no new finding; `npm run test:client`; `git diff --stat` against the base: name every file outside the bundle's file
   map and say whether it weakens a check; the driver's flow for the bundle really goes through the screens.
 - Five ui-align ids of the bundle at random against the screens: done as claimed or not.
Write VERDICT.md in your verify folder (40 lines or fewer). Hand back in 20 lines or fewer: merge or fix; findings by
severity (blocker, high, medium, low) with file:line and the number or words that failed; what you could not measure.
