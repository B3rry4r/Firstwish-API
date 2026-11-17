PATCH P-W9 | TIER T2 (pack wishes are paid; a public link) | Budget 120 steps. The Vault check's findings; change nothing else.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md (rules, checks), rulings IA1-IA4, R10 in /home/user/Firstwish-API/build/rulings.md and rulings-phase3.md, and
the verifier's file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w9-business2/VERDICT.md (pictures in shots/).
Work: commit on local branch `w9-business2` (880e7c5) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w9 (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w9 w9-business2`; `npm ci`), API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w9-api at the commit in your spawn line; ports
5600-5619; stack prefix pw9; the stack BUILT. Run every command with your own worktree as the working directory.
You own the W9 files (app/app/pro/{vault,reveal,favourites}/**, components/app/pro/vault.tsx, RevealPlay.tsx,
app/r/**, lib/vault-api.ts, scripts/live/flows/w9.mjs) and ONE added prop on components/app/life/PayStart.tsx (F5).
 F1 (high, IA1) lib/vault-api.ts:163-165, app/app/pro/reveal/new/page.tsx:107-123: a wish is taken with no reveal
    after a refused send (bad email, then fixed), a lost answer on the wish create then a retry, a lost answer on
    the send then a retry (and the screen shows a 409 though the reveal went out), and two tabs. Make every one of
    those end with ONE wish and ONE reveal, using what the server has today (its Idempotency-Key on both calls,
    keys that are the same for the same shoot and client in any tab and after a reload, reading the shoot's
    reveals before making anything). Prove each path with the pack count, the wishes and the reveals on the server.
    What the web cannot close without the server: say exactly which path and what the server must do (REQUESTS).
 F2 (high, IA2) app/r/[code]/page.tsx, components/app/pro/RevealPlay.tsx: rebuild the client's page from the
    receiver's parts: its passcode screen (styled, no sideways scroll at 360), the client wish's opening in the
    chosen style and cover, then the photos; the brand mark the receiver's page carries; a 429 under its own words
    (not "This is not here."); a signed url that has expired or fails is asked for again (a tab left open past 10
    minutes still shows the photos). If the server's /v1/r/:code does not give the style and cover, say so under
    REQUESTS and draw what it gives inside the receiver's chrome.
 F3 (medium, IA1) Back then send again: the form reads that this shoot already went to this client (when, the
    link) and sends again only by "Send again"; no second wish otherwise.
 F4 (medium) Vault at 360: the "More space" button stays inside its cell (measured: right edge <= the cell's).
 F5 (medium) components/app/life/PayStart.tsx:61 says "The wish stays as it was" on a slow return of a VAULT
    payment: one optional prop for what is being paid for, default unchanged for every other caller (name each
    caller you checked).
 F6 (low) One request for a double tap on remove-a-file and on Switch off.
The live flow w9.mjs checks F1's four paths, F3 and the client page, and passes; then the whole driver: 0 FAIL but
the two known W7 ones. Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates,
test:client, build; measure /r, Vault and the reveal form at 360, 390, 1440 (light and dark by data-mode).
Commit on w9-business2; do not push; remove your worktrees, stack and databases; leave no background jobs. Hand
back ONCE in 12 lines: head; F1-F6 with file:line and the measured proof; REQUESTS; the driver's totals; `git diff
--stat` against 880e7c5; stale baseline ids if the list changed.
