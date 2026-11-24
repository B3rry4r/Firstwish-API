BUILDER API-BASE-23 | TIER T2 (people's photos: privacy; what the upload accepts) | Budget 120 steps. No photo carries a position to someone else; no photo kind the server cannot open. Nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; tests ONLY through `npm test -- ...` or `npm run test:affected -- ...`
with `--maxWorkers=2`; never pkill, killall or pgrep -f; never edit, build, checkout or reset anything in /home/user/Firstwish-API or /home/user/Firstwish-web themselves.
Read /home/user/Firstwish-API/build/common-rules.md; rulings IM1, IM2 (the END of /home/user/Firstwish-API/build/rulings-phase3.md), HP3, II4 there; src/common/ports/adapters/ (the sharp
image sizing merged in round 22: its copies carry no metadata), src/modules/stored-files/** (confirm, the file jobs, file-rules.ts: IMAGE_WIDTHS and the
kinds accepted, the file view and its `variants`), and every place a photo's address is signed for someone (the owner's wish read, the public link's
view, the render read, friends' photos on a group wish, a business's client reads, a creator's style files, the Vault and a shoot reveal).
Work: /home/user/Firstwish-API, local branch `api-base-23` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/api-base-23 (`npm ci`, `npx prisma generate`); TEST_DB_PREFIX=ab23. Do not edit a gate or a baseline; an
older test changes only where a case makes its expectation wrong (name each). Registry: ONE reopen, additive, DEC rows (and in it put right two
stale records: `videoRender.statusMaxSeconds` is 60 by ruling IK6a; `Wish.limits` (round 21, IL1a) is on the wire and belongs in the registry).
The fact (found on 24 Nov): the ORIGINAL of an uploaded photo keeps its EXIF, GPS position included, and the addresses
handed to receivers point at originals; the web reads no sized copy. So a wish can carry its sender's position.
Cases (a test for each through the real routes, with REAL pictures holding GPS and a camera serial; FIRST show what the head does today):
 1. IM1: for EVERY read that hands a photo to someone other than its owner (list each route you found): the bytes
    at the signed address hold no GPS, no serial, no XMP position, no embedded thumbnail with them. The server
    serves a clean copy (made at confirm: say where it is kept and that it is the one hashed, kept (II4) and
    erased with the file) or a sized copy; the untouched original is reachable by no one but its owner (say
    whether the owner still needs it at all: if not, the clean copy REPLACES it and nothing untouched is kept:
    the simpler and safer rule: prefer it and say what breaks, if anything).
 2. Files stored BEFORE this round: a job cleans them (or they are cleaned when first asked for); until a file is
    clean it is not handed to a non-owner. (No real rows exist; make them in a test.)
 3. The reads give the web what it needs to show sized copies: each photo's view carries its variants' signed
    addresses (w320, w768, w1600; additive) for the owner's reads, the public link's view and the render read; a
    photo whose sizes are not made yet (the job has not run, or failed): what the view gives (the clean full-size
    copy: never nothing, never the untouched original).
 4. IM2: HEIC and HEIF leave the kinds the upload accepts: an upload start for one is refused with words that say
    to send a JPEG or PNG; a file that claims JPEG but is HEIC inside is refused at confirm; say every place the
    accepted kinds are listed (the rule, the contract's notes, the entitlements or limits read the web draws its
    picker from) and change each. A HEIC already stored: what a reader gets (words, not a broken picture).
 5. Voices, clips and Studio files: do THEY carry positions or device data (an m4a's or an mp4's location atoms)?
    Report what you find; strip where the same tool can (ffmpeg is on the server for the video maker: -map_metadata -1),
    else list it as open.
Checks: typecheck; the WHOLE `npm run lint`; scripts/gates.sh; check-contracts, check-drift, check-routes; the
stored-files, wishes, public-wishes, render-jobs and studio folders' specs; do NOT run the full suite (the lead's merge
check runs it; if your session refuses a registry command, do not retry and ask nobody: say NOT DONE). Commit on
api-base-23; do not push; remove your worktree. Hand back ONCE in 12 lines.
