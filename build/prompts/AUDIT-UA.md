AUDITOR AUDIT-UA | TIER T1, reading only (no stack, no build, no suite: you are not a heavy job) | Budget 90 steps. You change NO file in either repo. You did not build any of this. Test, do not trust.
Why: all 89 screens are wired, yet /home/user/Firstwish-API/.pipeline/ui-align-tasks.json still has 241 rows with status "open". Builders marked rows
by screen; many open rows are the same five rules repeated on 18 maker screens, or stubs with no screen, and may
already be true on the head. The lead needs each open row judged against the code as it is NOW.
Read: the open rows (id, kind, screenId, files, change); /home/user/Firstwish-web at branch claude/sleepy-mayer-f0hkb8 (the head in your spawn
line; read it with `git show <head>:<path>` and `git grep <pattern> <head> -- <paths>`, never the working folder, which other
jobs may be using); the contract file lib/contracts/firstwish-contracts.d.ts at that head; rulings R10-R17 in
/home/user/Firstwish-API/build/rulings.md and the lists build/sweeps/web.md and build/sweeps/api.md (what is already known to be owed).
For EVERY open row give one verdict with evidence:
 - done: the change the row asks for is true on the head: file:line that shows it (the read from the server, the
   deleted local store, the state that can be entered and what enters it). A row about a rule on many screens
   (the promotion from the price book, integer kobo, GET /v1/prices, Wish.keep, the wish number): find the ONE
   place the maker gets it and judge that; then say for each screen's row whether that screen still has its own
   literal (grep each named file for a typed price, a percentage, 0.4, a naira figure, a boolean keep).
 - not done: what is still wrong, file:line, and what it needs (a web change, a server route that does not exist:
   name it, or the owner's word).
 - not applicable: the thing the row names no longer exists or was ruled out (cite the ruling or the deletion).
 A designed state (loading, empty, error): "done" only if you can name the condition that enters it in the code
 and the words it shows; you cannot render it, so mark such rows "done by reading" and list them apart: the lead
 will have a sample rendered.
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/audit-ua.txt: one line per row: `UA-<n> <screenId or none> | done | not done | not applicable | <evidence or
what it needs>`, in id order; then a summary: counts by verdict; the not-done rows grouped into bundles of 2 to 5
by the files they touch, each with the tier you would give it; the rows that need a server route; the rows that
need the owner. Also write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/audit-ua-leftovers.txt: anything you saw on the way that no row covers (a
fixture still imported on a live path, a typed price, a dead control, a local store) with file:line.
Hand back ONCE in at most 15 lines: the counts, the bundles, the five most important not-done rows, what you could
not judge by reading.
