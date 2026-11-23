VERIFIER API-BASE-21 | TIER T2 (what a ticket buys: video clips), full | Budget 90 steps. You did not build this. Test, do not trust. You fix nothing.
THE MACHINE RESTARTS WHEN OVERLOADED: ONE heavy job at a time, jest with `--maxWorkers=2`; never pkill, killall or pgrep -f (stop only PIDs you
started); notes as you go to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-21/NOTES.md (if it exists an earlier verifier was lost: read it, carry on).
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/prompts/API-BASE-21.md (its cases are the contract), rulings IL1, IL1a, IJ2, IJ3, IJ3a (in
/home/user/Firstwish-API/build/rulings-phase3.md), truths T-05, T-08, T-30 in /home/user/Firstwish-API/.pipeline/product-truths.json.
Under test: /home/user/Firstwish-API local branch `api-base-21` (head 9107c81) against its base 39c6646. Your own detached worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-ab21 (`npm ci`, `npx prisma generate`); ports 5210-5219; TEST_DB_PREFIX=vab21. Probes as specs under the
verify folder, through the real routes. ffmpeg and ffprobe are at /usr/bin here: make REAL clips with ffmpeg for your probes.
The builder's claims: the book decides the count (none on a draft, Moment, Keepsake, Signature; 3 on Premiere; 4 with
the clip extra; 5 with both extras); the next upload is 409 clips_full with words; twenty at once give 3; an
unconfirmed upload holds a place for 15 minutes. A clip's length is read from the stored FILE at confirm by a new
ClipLengthPort and kept in stored_file.lengthMs (migration 20261209090000, with a DOWN note); over its place (15 s, or
one 60 s with the long-clip extra) is refused with words; an unreadable file is refused and removed; a 0.5 s slack
(its own default, DEC-324). The seal, the ticket start, ticket-offers and the ticket's settle refuse more or longer
clips than the ticket gives, with words and no payment row. A ticket refund or a clip-extra refund is held back (409
clips_held) while the wish holds the clips. The owner's reads gain `limits` {photos, voices, clips: {count,
seconds[]}}. The registry was NOT reopened (hand-kept contract types and d.ts; DEC-323 to 325). The real adapter
needs `ffprobe` on the server's PATH and reads through a signed storage address; without it every clip upload is
refused; the stand-in reads the MP4/WebM header itself. No older test changed. Full run 1661 passed.
Attack (each PASS or FAIL with what you saw; a paid thing lost or sold-but-withheld is a BLOCKER):
 - The length: REAL files: 14.9 s, 15.0, 15.4, 15.6, 16, 59.9, 60.4, 61 s; an MP4 whose header LIES about its length
   (edit the mvhd duration) against what ffprobe says: which does each adapter believe; a WebM with no duration; a
   .mov, an audio-only file, a 0-byte file, a picture renamed .mp4, a 2 GB claim: refused and REMOVED from storage
   (count the objects); the real ffprobe adapter end to end on a stack with real storage stand-in addresses; ffprobe
   missing (PATH without it): refused with words, nothing kept; ffprobe hanging: is there a time limit?
 - The count: the 15-minute hold: twenty starts never confirmed block a paying person for 15 minutes (say so);
   after it lapses; a deleted clip frees its place at once; the long-clip place taken by a short clip and the other
   way round (which place does a 12 s clip take when both extras are held; can a person end unable to use the 60 s
   place they paid for?).
 - Money: a Premiere wish with 3 clips then a ticket change to Signature or a refund: every path (start, settle of a
   payment made BEFORE the clips were added, the webhook late, staff routes, a Pass, a business order): none ends
   with clips on a ticket with none, and none takes money and then refuses the seal with no way out (what must the
   person do; do the words say it). The clip extra bought, used, then refunded by staff: 409 clips_held with words;
   after the clip is removed the refund goes through.
 - Old data: a Premiere wish that already holds 8 clips (make it by SQL, lengthMs null): its reads, its seal, its
   link: what happens; is anything paid for lost?
 - The contract: `limits` on the wire with the registry NOT reopened: do check-contracts and the web's contract
   export agree with what the server sends (is a field the web will read missing from the frozen registry: a
   finding); the migration on a database at the base and a fresh one.
Then typecheck, the WHOLE lint, scripts/gates.sh, check-contracts, check-drift, check-routes, and `WEB_LIB=/nonexistent/lib
npm test -- --maxWorkers=2` once (if your session refuses that command, do not retry and ask nobody to run it: say NOT RUN).
Verdict file /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-base-21/VERDICT.md (40 lines or fewer): MERGE or FIX FIRST, findings by
severity with file:line. Drop your databases, remove your worktree. Hand back ONCE in 15 lines.
