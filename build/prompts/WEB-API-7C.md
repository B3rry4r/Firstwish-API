BUILDER WEB-API-7C | TIER T2 (a paid wish playing; a creator's unpublished work) | Budget 110 steps. A wish made in a creator's Studio style plays for its receiver, from the server; change nothing else.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; commit at every closed case; NEVER commit
tsconfig.json; stop only PIDs you started; final suites in the FOREGROUND; hand back once, nothing left running.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, rulings II1, II3, II4, HX4, R10 in /home/user/Firstwish-API/build/rulings.md and
rulings-phase3.md, and the contract (lib/contracts after your sync): E-266 GET /v1/w/:slug/style-files now answers
{style, document, items}: the APPROVED document of the wish's style as that wish plays it (the version it was made
under) with that version's files; for a passcode wish it needs the header `x-unlock-token` (the same token the
wish read E-129 gives after the passcode); E-196 GET /v1/styles/:id carries `document` for an approved live Studio
style (null for a house style); the answers are no-store.
Work: a new local branch `web-api-7c` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line: it holds
the Studio files bundle) in a new worktree .../build/wt/web-api-7c (`npm ci`); API worktree .../build/wt/
web-api-7c-api detached at the API commit in your spawn line; `API_DIR=<it> npm run contracts:check` exits 0.
Ports 5660-5679; stack prefix wa7c; the stack BUILT.
You own: lib/style-files.ts, the wish player's choice of what to play (app/w/[slug]/** and the component that
picks a house package or a made style; components/engine/made/** for the host only), the maker's style preview
for a creator style (the one read), the public style page's preview for a creator style, scripts/live/flows/
wa7c.mjs (new; joins the driver). Import-only: lib/api.ts, lib/studio.ts, components/app/studio/**.
Cases:
 1. At /w/<slug> a wish whose style is a creator's approved Studio style plays that style: the document and the
    files come from E-266 (never from the creator's own routes, never from the browser); every kind the document
    uses is drawn (artwork, a background, a fill, the poster, the sound, a 3D model); a file with no address
    draws the style's own fallback, never an empty frame. A house style plays exactly as today (no extra read
    where the wish read already says it is a house style).
 2. The wish's gates are the server's: before it may be opened, sealed for a later moment, resting, removed,
    link off: nothing of the style is asked for or drawn beyond what the wish page shows today; a passcode wish
    sends `x-unlock-token` (held in memory only) and asks only after the passcode is right.
 3. The version (II3): a wish made under version 1 plays version 1 after version 2 is approved; a new wish plays
    version 2; a picture the creator deleted that version 1 names still plays for the version 1 wish (II4).
 4. The style switched off, and its creator's account erased (HX4): wishes already made still play, with an empty
    byline and no creator link for the erased one.
 5. Choosing: in the maker a creator's approved style can be previewed and picked like any style the server has
    on for the kind and the ticket (its preview plays E-196's document with sample photos, clearly a preview);
    the public style page of a creator style previews it the same way; a style the server no longer offers
    cannot be picked.
 6. States: loading, the read failed (the designed words and Try again), offline mid-play (what was drawn stays).
The live flow wa7c.mjs makes its own creator, style (approved through the staff route), wishes and files, and
removes them; alone on a FRESH stack 0 FAIL twice; then the whole driver ONCE (a FAIL outside your files: rerun
that flow alone and report both).
Checks (quiet logs, EXIT lines): typecheck, lint on changed files, check:css, gates, test:client, contracts:check,
build; measure /w/<slug> playing a creator style at 360, 390 and 1440, light and dark (no side scroll, no control
outside its cell); one light/dark picture pair; R10: browser storage empty at every step. Commit; do not push; do
not edit .pipeline-ui/wired.json, scripts/gates/** or a baseline; remove YOUR worktrees, stack and databases.
Hand back ONCE in 10 lines: head; cases 1-6 closed or not with the proof; the flow's totals and the driver's;
edits outside the file map; what you could not do.
