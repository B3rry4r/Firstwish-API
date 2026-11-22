VERIFIER WEB-API-7 | TIER T2 (uploads, a payment start, the staff price book), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time; notes to
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-7/NOTES.md as you go (if it exists an earlier verifier was lost: read it, carry on);
stop only PIDs you started.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md, WEB-API-7.md and WEB-API-7B.md (same folder: their cases are the contract,
EXCEPT case 7's receiver side, which is another bundle's), rulings R10, R14, IF1, HW2-HW4, HX1, HX3 in
/home/user/Firstwish-API/build/rulings.md and rulings-phase3.md, and the claims in the verify folder's CLAIMS.md.
Under test: /home/user/Firstwish-web local branch `web-api-7` (head a1c99b6) against its base d99117c. Your own detached worktree
.../build/wt/v-wa7 (`npm ci`) and an API worktree .../build/wt/v-wa7-api detached at the API commit in your spawn
line (NEWER than the branch's contract copy: `contracts:check` will differ; run typecheck once more after a
`contracts:sync` in YOUR worktree and report it; do not commit). Ports 5660-5679; stack prefix vwa7; the stack
BUILT. Probes under the verify folder, not in the repo.
Attack in a real browser at 360 first (each PASS or FAIL with what you saw):
 - Uploads (a creator's work and a person's storage; a wrong file accepted or a lost file is HIGH): every kind
   (picture, poster, sound, 3D model, profile picture): over the limit by one byte and far over; 0 bytes; a wrong
   kind under a right name (.exe as .png, an SVG, a sound as a picture); the file changed between the ticket and
   the put; the network cut mid-put then Retry; a double tap on Add; two tabs adding at once; leaving the editor
   mid-upload; held and refused files (STANDIN_SCREENING): what each tile says and that a held or refused file
   cannot be placed in the style; another creator's file id placed or deleted by hand (the server's refusal in
   words, nothing drawn); a login with no creator side. After a reload and in a second browser context the same
   files; a placed file then deleted: what the editor and the owner's preview show.
 - The limit's words: staff change the limit (3 MB, then back): the screen's refusal equals the server's field
   text both times, with no reload trick; grep the web for a second limit number (400, 2.5, 15 MB literals).
 - Signed off, Creator to Open (the server's day asked first), the payout figure and Published: each against the
   server's answer; with the read held and failed (route interception): designed loading and error words.
 - Staff Prices (money: a wrong figure is the price book): as owner and finance change one line of each kind;
   as support and as a read-only staff role the control is not drawn or is refused in words; negative, 0, a
   decimal, 16 digits, letters: the server's words; two staff saving the same line (the later one's answer);
   the audit shows old and new; the PROVISIONAL marks still follow `confirmation` only.
 - IF1: the Studio payment start's body carries returnPath (own-site path); paid, pending, failed and another
   person's reference are said on that screen; a double tap makes one payment.
 - R10: localStorage, sessionStorage, IndexedDB empty at every step. No dead control and no native browser
   control drawn (a styled control may open the system's file picker).
 - The edits outside the file map (list in CLAIMS.md): read each diff: does any change behaviour its owner
   screen's flow does not cover? Run those screens' flows alone.
 - gates (no new baseline entry; the baseline file and wired.json untouched), typecheck, test:client, check:css,
   build exit 0; wa7.mjs alone twice; the whole driver ONCE: totals (p-w5 "L1" is known on the head; any other
   FAIL: rerun that flow alone twice and report both).
 - Measures and pictures: the Studio editor with the Files panel and each sheet, the Creator pages and staff
   Prices at 360, 390, 1440, light and dark: no side scroll, no control outside its cell; open at most 8 pictures.
Write VERDICT.md in the verify folder (40 lines or fewer): MERGE or FIX FIRST; each finding with severity
(blocker, high, medium, low) and file:line. Remove your worktrees, stack and databases; leave no jobs. Hand back
ONCE in 20 lines or fewer.
