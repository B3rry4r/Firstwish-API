VERIFIER wave 4 join | TIER T2, erase and money joins | Budget 45 steps. You did not build this. Test, do not trust. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, build/prompts/WAVE4-JOIN.md (J1 to J8 are the contract), and in
build/rulings-phase3.md: OO5, QQ3, QQ4, SS1, RR3, VV2, NN2.
Under test: local branch `p-join4` at 96bc81d of /home/user/Firstwish-API; `git diff 1d6f91c 96bc81d` is what you check (28 files).
Your own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-join4 (detached at 96bc81d; `npm ci`); ports 4860-4869; TEST_DB_PREFIX=vjoin4; a clock in 2189;
remove both when done; kill by PID.
Check, each PASS or FAIL with what you saw:
 J5 (the risky one): erase a business owner with client wishes that are a draft, sealed and not yet opened, live, and resting.
    - Right after: the owner's name, email and the client's name and contact are in NO table (scan every table for the strings);
      the receiver's link of the sealed and the live wish still plays (photos load: the files were not erased) and shows no
      owner or client personal data beyond what the wish itself says; the draft is gone.
    - At the end of each term (move the clock, run the due jobs with `only`): the wish, its files, its link and its ClientWish
      row are erased; it does not rest for a year; the job run twice changes nothing.
    - It must not open a hole: a person's own (non-business) wish after their erase still answers as an erased wish does
      (no content), a business wish of ANOTHER, not erased, business is untouched, and nobody can make a wish "business" to
      dodge an erase (try setting businessId through every wish route as a plain user).
    - The erased owner's sessions, tokens and logins are dead; nobody can sign in to the closed business.
 J8  after erasing a wish and after erasing an owner: the name is in no table (scan), the old link answers as an erased wish
     does with no name in the body or a redirect; a slug whose tail is under 8 characters (if one can exist): say what happens.
 J3  rest, take down, remove, erase: the showing tables hold no row of the wish in the same transaction; the public list and
     the direct read do not show it; a wake needs a new ask and a new approval.
 J1  one invoice per plan, pack and Vault payment, numbers in order under 20 settles at once; a rollback leaves no gap; a
     refund voids exactly its own invoice; no invoice for a ticket payment by a person.
 J2, J4, J7: as the brief says (J7: seed twice after editing a message's wording as staff: the wording and version stay).
 Also: `git diff 1d6f91c 96bc81d -- src/modules/public-wishes src/modules/stored-files src/modules/wishes`: read every changed
 line and say whether any path now serves content it should not.
Checks (quiet logs, EXIT lines): typecheck, gates.sh, check-contracts, `npm run test:affected -- src/modules src/common test`
twice (name any failing test).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/join4/VERDICT.md (30 lines or fewer). Hand back in 15 lines or fewer: merge or fix; findings by severity with file:line.
