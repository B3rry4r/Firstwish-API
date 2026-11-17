VERIFIER P-W9 re-check | TIER T2 (pack wishes are paid; a public link) | Budget 70 steps. You did not build this. Only the patch's F1-F6 and what it could break. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time (a build, a stack, a driver run: never two), and write
your findings to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w9-business2/round2/NOTES.md as you go. Stop ONLY processes you started yourself,
by the PID you recorded when you started them: other agents' stacks and drivers are running on this machine.
Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md (rules), the patch brief /home/user/Firstwish-API/build/prompts/P-W9.md, rulings IA1-IA4, R10 in
/home/user/Firstwish-API/build/rulings-phase3.md and the first check's /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w9-business2/VERDICT.md. Under test: /home/user/Firstwish-web local
branch `w9-business2` (head in your spawn line; the first check's head was 880e7c5). Make your OWN detached
worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-w9 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-w9-api (API at 0cae424) (another worktree of that branch
exists at wt/p-w9: do not touch it); stack prefix v2w9; ports 5620-5639; the stack BUILT. Run every command with
your own worktree as the working directory.
 1. F1, one wish and one reveal on every path (count the pack, the client wishes, the reveals and the outbox on
    the server after each): a refused send then fixed; the same with a reload between; a lost answer on the wish
    create then a retry; a lost answer on the send then a retry; two tabs; two DIFFERENT browsers (the patch locks
    across tabs with Web Locks, which does not reach another browser or device: what happens there?); a reload in
    the middle of a send; the form reopened the next day (the patch finds a left-behind wish by client, occasion
    and day in the last 24 hours: can it pick up a wish that is NOT a failed reveal: a client wish the business
    made on purpose for the same client and day: and turn it into a reveal, or send the wrong wish?). Any path
    that takes a wish with no reveal, or reuses a wish the business made for something else, is HIGH.
 2. F3: back then send again: the "Went" screen (when, the link); "Send again" takes no second wish and says what
    it does; a different client for the same shoot is a new reveal and takes one wish.
 3. F2, the client's page /r/<code>: it is the receiver's page (compare with /w/<slug> of a sealed wish on the same
    stack: the same passcode screen component, chrome and brand mark): the style and cover the business chose are
    what plays; 360x740, 390x844, 1440x900, light and dark by data-mode: no sideways scroll, every control in its
    cell; a wrong passcode, 10 wrong ones (the 429 words), the link off (410 words); nothing of the shoot before
    the passcode in the page or the network; a tab left open 11 minutes (move the stand-in clock or wait) still
    shows the photos; storage as the page sees it stays empty.
 4. F4, F5, F6: the Vault at 360 (the More space button inside its cell); PayStart's slow-return words for a Vault
    payment and UNCHANGED for a ticket, a keep, a plan and a Pass (drive one of each to its slow return); one
    request on a double tap of Remove and of Switch off.
 5. The flow scripts/live/flows/w9.mjs alone: 0 FAIL; its diff against 880e7c5: no check weaker. typecheck, gates,
    test:client EXIT 0. Then the whole driver ON A FRESH stack: 0 FAIL but the two known W7 ones (the builder says
    a SECOND run on a used database crashes in w12.mjs on an invoice_link key: confirm in one line whether that is
    the w12 flow's own second-run state; do not chase it).
Hand back ONCE in at most 14 lines: verdict (merge / fix first), findings by severity with file:line, what was not
run. Remove YOUR worktrees, stack and databases; leave no background jobs.
