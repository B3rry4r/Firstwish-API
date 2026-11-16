PATCH P-W1b | TIER T0 copy | Budget 45 steps. The owner's website words come back; nothing else changes. The lead reads the diff.
Read ruling HV1 in /home/user/Firstwish-API/build/rulings-phase3.md (no bundle deletes or rewrites the owner's website words) and the second
verifier's rendered-text diff /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/w1-site1/round2/sdiff.txt (base against branch).
Work: commit on local branch `w1-site1` (eeb1069) of /home/user/Firstwish-web in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w1b (`git worktree add
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-w1b w1-site1`; `npm ci`). Run every command with your own worktree as the working directory. No server, no browser.
The base is `git merge-base w1-site1 claude/sleepy-mayer-f0hkb8`: read each sentence there (`git show <base>:<file>`) and put it
back WORD FOR WORD. The one change allowed inside a restored sentence: a money figure, a count or a date the page now
reads from the server is drawn from that read in the same place in the sentence (never typed again).
 1. components/site/ProPlans.tsx: the plan-card lines ("Any wish, Shoot Reveal included", "A client dashboard", "Unused
    wishes roll over one month", "For studios", "Everything in Starter", "A team of 3 logins", "Priority support"), the
    Vault footnote ("Past 1 TB, ... Vault space is never discounted") and the line "... a month per 100 GB, billed by
    the blocks you use that month"; the wish-pack card's "Admit one / Once / Wish pack", "Use them whenever you like",
    "For a business that wants to try it first".
 2. app/business/page.tsx: Act 01's "Unused wishes roll over one month"; "Up to 40% off" (the figure from the offer
    read); "VAT invoices".
 3. app/pricing/page.tsx: the Keepsake FAQ's "...and tells you when it's opened"; "premium on Signature and Premiere";
    "Three days before"; "Prices shown are before the ... off ... Keeps stay at the price shown"; "prices shown struck
    through".
 4. The ticket cards: the base's lines ("Premium", "With video", "Premium styles made for video" and the others) in
    the base's order; the branch's new lines ("Live a month", "Live two months", "Free preview", "Everything in
    Moment") go unless the base had them.
 5. app/creators/page.tsx: "Premium styles as templates"; "₦0"; the numbers in words where the base wrote words
    ("Ten", "thirty-five", "Two reviews") when they are fixed words of the sentence, drawn from the read when the
    server serves that number.
 6. Then your own reverse sweep: `git diff <base> w1-site1 -- app components/site` for every removed or changed
    string a visitor reads; restore any other the lists above miss, EXCEPT the rows copy.md marks KEEP REMOVED (the 3
    quotes, "1 min", the 2 Soon cards, "Most popular", the typed "₦8,000 to ₦12,000") and "Seven" -> the styles count.
 Do not judge whether the product backs a sentence: restore it, and list under OWNER (file:line, the sentence, what
 you could not find behind it) any you believe nothing delivers. If the gates then fail on a restored sentence, do
 NOT edit the baseline or the gate: add the MECHANISM comment when a real file delivers it, else report the FAIL line.
Checks (quiet logs, EXIT lines): typecheck, lint on the changed files, check:css, `npm run gates`,
`NEXT_DIST=.next-pw1b npm run build` (delete that folder after). Commit on w1-site1; do not push; remove your
worktree; leave no background jobs. Hand back ONCE in 8 lines: head; items 1-6 with file:line; the OWNER list; the
gate and build EXIT lines; `git diff --stat` against eeb1069.
