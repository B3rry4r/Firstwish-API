MERGE AGENT (web), second run | TIER T1 | Budget 150 steps. Carry on the chain from Maker content: make the driver honest on this tree, then take in Website and Studio.
Read /home/user/Firstwish-API/build/prompts/MERGE-CHAIN.md (the rules of a merge: follow all of them) and /home/user/Firstwish-API/build/prompts/P6-COMMON.md. The
first run stopped after merging w5-maker2: local branch `merge-chain-2` of /home/user/Firstwish-web at 6cdbd43 (static checks all 0; the
driver 614 of 619). Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/mc2b on that branch (`git worktree add /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/mc2b
merge-chain-2`; `npm ci`), API worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/mc2b-api at the commit in your spawn line; ports 5400-5419;
stack prefix mc2b; the stack BUILT. Run every command with your own worktree as the working directory. You may
change scripts/live/flows/** and scripts/live/drive.mjs (flows only: no screen code; a fault in a screen is
reported, not patched). Two other browser stacks share this machine: before you call a check failed, run its flow
alone once more and say the load average.
First, on 6cdbd43, these four (the fifth, W7 "resting, ended and removed", status=200/410, is known and stays):
 1. "the W5 flow ran to the end" (flows/w5-maker2.mjs:184-186): the flow aborts the put to standin.invalid and waits
    for "Try again", but the stand-in put is now same-origin at /v1/standin-storage, so nothing is aborted. Abort the
    put where it really goes; the check stays (a failed put offers "Try again" and the retry succeeds).
 2. "the W5b flow ran to the end": the pics-null picture was fixed in the merge commit; run it and say.
 3. "W7 countdown": the page said "0:18" where the check expected "00:18" (the run was just after midnight in
    Lagos). Find which is wrong by the design's own words for that screen (app/w/[slug] and its design copy): if
    the flow's expectation is wrong, make the check right at every hour of the day (test it with
    STANDIN_CLOCK_OFFSET at 00:18, 09:05 and 22:42); if the PAGE is wrong, do not touch the page: report it with
    file:line and leave the check failing.
 4. "W13 moderation: the held photo is in the queue and drawn for the moderator": it passed twice on the work head
    alone. Run w13 alone on this tree, then after the W5 flows: is it load, or do W5's uploads change what the
    moderator's queue shows first (then the check must find ITS OWN photo, not the first)? Fix the flow; never
    loosen what it checks.
Then the whole driver: 0 FAIL but the known one (and item 3 if the page is at fault). Commit ("Merge chain: flows").
Then the chain as MERGE-CHAIN.md says, ONE merge commit each: w1-site1, then w10-studio (its step b2), skipping
step c (lib/site-plans.ts stays until Business is in). After each: the static checks and the whole driver.
Hand back ONCE in at most 14 lines: the commit ids in order (flows fix, the w1 merge, the w10 merge; or where you
stopped); for items 1-4 the cause and file:line; per merge the conflicts, the lines you wrote, the EXIT lines and
the driver's totals. Remove your worktrees, stack and databases (keep the branch); leave no background jobs.
