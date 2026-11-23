VERIFIER WEB-API-7C | TIER T2 (a paid wish playing; a creator's unpublished work), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-7c/NOTES.md as you go (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, WEB-API-7C.md (same folder: its cases are the contract) and rulings II1, II3,
II4, II5a, HX4, R10 in /home/user/Firstwish-API/build/rulings.md and rulings-phase3.md.
Under test: /home/user/Firstwish-web local branch `web-api-7c` (head f49a703) against claude/sleepy-mayer-f0hkb8 (daa92f6). Your own detached worktree
.../build/wt/v-wa7c (`npm ci`) and an API worktree .../build/wt/v-wa7c-api at the API commit in your spawn line;
ports 5660-5679; stack prefix vwa7c; BUILT; start the stack with
STANDIN_SCREENING=hold:held,reject:refused,reject:bigpic:too-large in the environment. Probes under the verify
folder, not in the repo.
The builder's claims: cases 1-6 closed by scripts/live/flows/wa7c.mjs (59 PASS alone, twice, on a used stack); a
creator style at /w/<slug> plays from E-266 only (1 read, no /v1/studio read); sealed, resting, link off: 0 reads;
a passcode wish asks only after the right passcode, with x-unlock-token in memory; version 1 wish plays version 1
after version 2 is approved, with a deleted picture still shown; switched off and erased creator still play (empty
byline, no creator link); the maker lists, previews (E-196, marked "Preview with sample photos") and picks a
creator style; the public style page previews it; loading, failed, offline states. KNOWN: `npm run gates` FAILS
with 3 fake_data findings in components/engine/Preview.tsx (lines 99, 111, 114); the whole driver was NOT run
cleanly; edits outside its file map: components/engine/Preview.tsx, components/engine/Host.tsx (a `studio-<id>` or
`studio:<id>` slug picks the made host), components/wish/link.ts, components/app/maker/StylePick.tsx,
components/engine/made/link.ts and CreatorPreview.tsx (new), scripts/live/drive.mjs.
Attack in a real browser at 360 first (each PASS or FAIL with what you saw):
 - Who can see a creator's work (a leak of an unapproved style is HIGH): at /w/<slug>, the maker and the public
   style page: a draft, a sent-in, a refused and a switched-off style, by typing its id or `studio-<id>` /
   `studio:<id>` into the address, the maker's style choice (PATCH by hand) and the style page: nothing of it is
   drawn and the server's refusal is said; no request to a creator-only route from a signed-out page.
 - The wish's gates: not yet opened, sealed for later, resting, removed, link off, a passcode before and after a
   wrong try, a second tab, a reload after unlocking (the token is in memory only: it asks again): count the
   style-files reads each time; nothing of the style is in the page source, a cache or browser storage (R10).
 - Every kind plays from E-266: artwork, a background, a fill, the poster, a sound, a 3D model (a model placed as
   the editor places it); an address that has run out mid-play (wait past expiresAt or null it): the fallback,
   no broken picture, and what a reload does. A HOUSE style wish: exactly as on the base (compare a house wish's
   requests and picture with the base build: the Host change must not alter it; try a house slug that starts
   with "studio").
 - Versions and kept files (II3, II4): as the claims say, plus: the creator deletes a version 1 sound and model.
 - Erased creator and switched-off style: plays; the byline, the creator link, the maker and the style page.
 - The maker: a creator style for a kind and ticket the server does not offer it for cannot be continued with;
   the preview is clearly marked a preview; components/app/maker/Maker.tsx:409 still tests
   `wish.style.startsWith("studio:")`: with the slug form the server really gives, does Continue work for the
   creator's own style and for another creator's approved one?
 - The gate: run `npm run gates` on the branch and on the head: list the findings the branch ADDS (file:line and
   the text flagged): is each a real new use of sample data, or an old accepted line that only moved? Say what
   the smallest honest change is (do not edit the baseline; do not say "accept").
 - wa7c.mjs alone on a FRESH stack twice; wa7.mjs, w10.mjs, w5-maker2.mjs, w11.mjs alone once each; then the
   whole driver ONCE on a fresh stack to the END (give it over 3400 s): totals; any FAIL: rerun that flow alone
   twice and report both. typecheck, test:client, check:css, contracts:check, build exit 0; tsconfig.json, the
   baseline and wired.json equal the head's.
 - Measures: /w/<slug> playing a creator style, the maker's preview and the style page at 360, 390, 1440, light
   and dark: no side scroll, no control outside its cell; open at most 8 pictures.
Write VERDICT.md in the verify folder (40 lines or fewer): MERGE or FIX FIRST; each finding with severity and
file:line. Remove your worktrees, stack and databases; leave no jobs. Hand back ONCE in 20 lines or fewer.
