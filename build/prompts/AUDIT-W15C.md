AUDIT W15C | TIER T0, read-only (no code change, no stack, no browser) | Budget 45 steps. Classify the old rule breaks that are still accepted in the web's gate, so the lead can cut the last clean-up bundles.
Read: /home/user/Firstwish-web/scripts/gates/baseline.json (386 accepted entries: hardcoded_signals 337, fake_data 34, deferrals 11, forks 4),
the gate's own code for each kind (/home/user/Firstwish-web/scripts/gates/checks/*.py: what exactly it flags), rulings R10, IJ1 and IH5 in
/home/user/Firstwish-API/build/rulings.md and rulings-phase3.md, and the file and line of every entry that is NOT a raw colour inside
components/styles/** (those colours wait for the owner: count them by style package only, one line each).
Never use pkill or killall; you start no process but your own reads. You change NO file in either repository.
For EVERY other entry (the 34 fake_data, 11 deferrals, 4 forks, the "state holder seeded with a literal" entries,
and every raw colour OUTSIDE components/styles/**) write one row: gate, file:line, what the code really is (read
it: 3 to 12 words), and ONE honest way to clear it, chosen from:
 A. delete: dead or lab-only code no screen a customer or staff member reaches needs (say how you know: who
    imports it, which route reaches it);
 B. read it from the server: say which existing read already gives it (endpoint id from
    /home/user/Firstwish-API/.pipeline/registry.json), or that a NEW read is needed and what it would return;
 C. it is designed content of the site (copy, a designed placeholder, a design token): say why the gate still
    flags it and what a truthful change is (move a colour into the token layer; a placeholder that is copy and
    names no sample person);
 D. a real duplicate to fold (forks): which file keeps the name, who imports the other;
 E. a comment that defers work (deferrals): what the deferred work is, whether it is done already (then the
    comment goes) or still owed (then it is a task: one line).
Never propose editing the baseline, the gate or its settings, or renaming something only so the gate stops seeing it.
Then group the rows into at most FIVE bundles a builder could take (files disjoint; say which need a server
change first), each with its row count and a guess at its size (small, medium, large), and list separately what
only the owner can decide.
Write the result to /home/user/Firstwish-API/build/tasks/W15C-PLAN.md (the one file you may create; plain words; tables allowed) and
hand back in 12 lines: the counts by letter, the bundles, the owner items, anything you could not classify.
