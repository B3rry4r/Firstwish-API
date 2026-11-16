VERIFIER W0a | TIER T1 lean (gates and harness) | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/W0A.md (its seven points are the contract), R10 in
/home/user/Firstwish-API/build/rulings.md, and the builder's findings file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w0a-gates-findings.txt (its top table).
Under test: the WEB repo /home/user/Firstwish-web, local branch `w0a-harness` (head 42a9020) against claude/sleepy-mayer-f0hkb8. Your own
worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w0a (detached at the branch; `npm ci`); ports 5120-5139; for the live harness set API_DIR to your own
detached worktree of /home/user/Firstwish-API (branch claude/sleepy-mayer-f0hkb8, `npm ci`, under /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-w0a-api) and your own prefix
vw0a; remove both worktrees and your databases when done; kill by PID (`ss -ltnp` on your ports shows nothing of yours).
Check, each PASS or FAIL with what you saw:
 - No screen changed: `git diff --stat` under app/, components/, lib/, styles/ is empty; next.config.ts gained only the /v1
   rewrite and it does nothing without API_ORIGIN (build both ways; a request to /v1/health with no API_ORIGIN is a 404).
 - The gates see the repo: files scanned equals your own count of source files; exit codes: 1 on findings, 2 on a zero-file
   scan (point the config at an empty glob in a scratch copy), 0 on a clean scratch tree.
 - browser_storage (R10) fires on each of these in a scratch file and stays quiet on the paired harmless one: localStorage
   .setItem / window.localStorage['x'] / const s = localStorage; s.setItem / sessionStorage / indexedDB.open / document.cookie
   = / caches.open with a /v1 URL / a store library import (zustand persist, idb-keyval, js-cookie) / localStorage reached
   through globalThis or a bracket string (globalThis['local' + 'Storage']: say if it escapes: a known limit is fine if
   stated); quiet on: the word in a comment, in a string shown to the user, a variable named localStorageNote, reading
   document.cookie for nothing (say what it does on a read).
 - product_invariants: fires on each banned word in customer copy and on a native <select>, <datalist>, type="date",
   window.alert/confirm/prompt; quiet under app/admin for the copy words; how many of the 68 findings are false (the word
   "type" as a verb or in code): read 20 and count.
 - fake_data: a live path importing lib/*-fixtures.ts fires; the findings count per bundle in the table adds up to the
   total (allowing files shared by bundles); pick ten findings at random and confirm each is real.
 - The live harness: up, drive, down, twice: it reads the price book through the app's origin and the value equals the
   API's own (change one price in the API's database and see the app origin's answer change: a value that exists only on
   the server); "wired 0 of 89" is printed and the exit is 1; the overflow it reports on / at 360 is real (measure it
   yourself: documentElement.scrollWidth and which element is widest: name it with its selector and width); down leaves
   no process, no database, and tsconfig.json unchanged.
 - web.yml: every step's command runs locally with the exit code the workflow expects.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w0a/VERDICT.md (25 lines or fewer). Hand back in 12 lines or fewer: merge or fix; findings by severity with file:line.
