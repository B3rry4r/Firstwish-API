BUILDER API-BASE-21 | TIER T2 (what a ticket buys: video clips) | Budget 110 steps. The server enforces the clip rules it sells; nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; a commit at every closed case; never
pkill, killall or pgrep -f (stop only PIDs you started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md; truths T-05, T-08, T-30 in /home/user/Firstwish-API/.pipeline/product-truths.json; rulings IL1, IL1a, IJ2, IJ3, IJ3a (in
/home/user/Firstwish-API/build/rulings-phase3.md); finding 2 of /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-20/VERDICT.md; src/modules/stored-files/stored-files.service.ts
(:144-148: clips upload with no count), src/modules/wishes/wish-content.ts (:67), the seal's checks (photos, voices, chapters only), and
how the photo limit is enforced (the entitlements book; the same way for clips).
Work: /home/user/Firstwish-API, local branch `api-base-21` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-21 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=ab21. Do not edit a gate or a baseline;
an older test changes only where a case makes its expectation wrong (name each). Registry: ONE reopen, additive, DEC rows.
The fact (a verifier, 23 Nov): on a Premiere wish 8 clip uploads all answered 201; a clip's `seconds` is refused as a
field; the seal checks no clips; a Keepsake wish's clip uploads were not tried. The truths: Premiere has THREE clips
of up to 15 seconds and is the only ticket with video; the extras (Premiere only): one more 15-second clip, and one
long clip of up to 60 seconds (IL1a: each held once).
Cases (a test for each through the real routes; FIRST show what the head does today):
 1. Count: a wish may hold as many clips as its ticket and extras give (read from the entitlements book, never a
    number in code): a draft with no ticket (what may a draft hold before it pays? the same rule photos follow),
    Moment, Keepsake, Signature: none; Premiere: three; with the extra: four; the fourth or fifth upload refused
    with words; twenty uploads at once never pass the limit.
 2. Length: the server knows each clip's length from the FILE (not from a field the browser sends: say how the
    stored file's length is read: the upload's own checking step, a probe of the bytes; if it cannot be known
    without a tool the server lacks, STOP and hand back the options, do not trust the browser): up to 15 seconds;
    one clip of up to 60 with the long-clip extra; longer refused with words.
 3. The seal and the ticket start: a wish holding more clips (or a longer clip) than the ticket being bought gives
    is refused in words that say what to remove, like photos above the limit; a ticket change downward too.
 4. A refund of a clip extra (IJ3, IJ3a): not refundable alone while the wish holds the clip it paid for.
 5. The reads: the wish read's limits say how many clips and what length the wish may hold (additive), so the web
    needs no number of its own.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
stored-files, wishes, purchases, payments and refunds folders' specs; then `WEB_LIB=/nonexistent/lib npm test --
--maxWorkers=2` once: 0 failed (if your session refuses that command, do not retry and ask nobody to run it: say NOT
RUN). Commit on api-base-21; do not push; remove your worktree. Hand back ONCE in 10 lines.
