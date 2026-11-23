PATCH P-API-BASE-21 | TIER T2, round 1 | Budget 60 steps. Close the named findings of the verdict; change nothing else.
Machine: 4 CPUs, 15 GB. ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); final runs in the FOREGROUND, quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/API-BASE-21.md, the verdict /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-21/VERDICT.md (items 1 to
6 and NOT PROVEN, with file:line), its probe spec and media in the same folder, and ruling IL1a (the END of /home/user/Firstwish-API/build/rulings-phase3.md).
Work: the local branch `api-base-21` of /home/user/Firstwish-API (head 9107c81) in a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-ab21 (`npm ci`,
`npx prisma generate`); TEST_DB_PREFIX=pab21. Do not edit a gate or a baseline. Each: FIRST a failing test through the real routes.
 H1 (high): three legal 10-second clips CONFIRMED at once on Premiere answered 422, 422, 200 and the two refused files
    were removed ("length never read"): a confirm in flight has lengthMs null and the next confirm counts it as a
    clip of unknown length (wish-clips.ts:59, :87 from stored-files.service.ts:177). Confirms of one wish are judged
    one after another (the wish's row lock, or each confirm reads its own length before it takes the lock and judges
    only CONFIRMED clips plus itself): three at once: three 200; four at once on Premiere: three 200 and one 409
    with words; twenty rounds.
 M2 (medium): a clip stored before this round has lengthMs null and never passes: a draft holding such clips cannot
    seal and cannot add a real clip. An old clip's length is read when it is first needed (the next confirm, the
    seal, the ticket start) and kept; only a clip that then proves too long or unreadable is named in the words
    (which clip to remove); nothing is removed without the person. (No real rows exist; make them by SQL.)
 M3 (medium): an audio-only file sent as video/mp4 is accepted as a clip by both adapters and takes a paid place: a
    clip must hold a VIDEO stream (ffprobe: a video stream; the stand-in: a video track in the header): refused with
    words, removed.
 L5: `limits` on the owner's wish reads is in the hand-kept types but NOT in the registry: ONE registry reopen,
    additive (Wish.limits with its shape), DEC row, so check-contracts and the web's export agree with the wire.
 L6: when the length cannot be read because the SERVER's tool is missing or timed out, the answer is a 503 with
    words that say to try again later (the file is not kept), not the words for a bad file; a bad file keeps its 422.
 NOT PROVEN by the verifier: a clip added AFTER a ticket or clip-extra refund was requested and before the second
    staff member approves (refunds.service.ts:112): the approval is refused (409 clips_held) and the refund can go
    through after the clip is removed: a test through the staff routes.
 Accepted, do not change: the stand-in believes the file's header and reads 1 MB (a stand-in's limit; say so in its comment).
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
stored-files, wishes, purchases, payments, refunds and ports folders' specs; then `WEB_LIB=/nonexistent/lib npm test --
--maxWorkers=2` once: 0 failed (if your session refuses that command, do not retry and ask nobody to run it: say NOT
RUN). Commit on api-base-21; do not push; remove your worktree. Hand back ONCE in 8 lines: head; each id before and
after; the registry reopen's DEC id; older tests changed and why; the full run's totals or NOT RUN.
