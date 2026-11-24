BUILDER WEB-10D | TIER T1 (screens that show and take photos; no money, no identity) | Budget 110 steps. The website shows the server's sized copies and takes only the kinds the server takes. Nothing else.
ONE heavy job at a time, in the FOREGROUND, only when `free -g` shows 6 GB or more; NEVER commit tsconfig.json; never pkill, killall or pgrep -f (stop only PIDs
you started); never touch scripts/gates/** or the baseline file; never edit, build, checkout or reset anything in /home/user/Firstwish-web or /home/user/Firstwish-API
themselves; no single command over 8 minutes; no `rm -rf` inside a loop; quiet logs ending in an EXIT line.
Read /home/user/Firstwish-API/build/prompts/P6-COMMON.md; rulings IM1, IM1a, IM2, IM3 (the END of /home/user/Firstwish-API/build/rulings-phase3.md) and R10 in /home/user/Firstwish-API/build/rulings.md
(nothing stored in the browser); lib/contracts/firstwish-contracts.d.ts (PictureSize; `variants` on Wish.pictures, PublicWishView.files and the render
read; the upload's refusal words); lib/files.ts, lib/engine/adapt.ts, components/render/**, components/app/maker/Photos.tsx, components/gather/Friend.tsx.
Work: a new local branch `web-10d` of /home/user/Firstwish-web from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in a new worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/web-10d (`npm ci`); the API at the commit in your spawn line in a detached worktree
.../build/wt/web-10d-api (`npm ci`, `npx prisma generate`); stack by scripts/live/stack.mjs (name web10d, ports 5300-5319, TEST_DB_PREFIX=web10d).
The server now (round 23): every photo it hands out is a clean copy; each photo's view carries `variants` (w320, w768, w1600, each a signed url and
`sized`: false means the size is not made yet and the url is the clean full-size copy); HEIC and HEIF are refused at the upload's start and at
confirm with the words "HEIC pictures are not taken. Send a JPEG or PNG."; a slow server answers a confirm 503 "We could not check this picture
just now. Nothing was lost. Try again in a moment." and keeps the upload; voices and clips are cleaned at confirm (422 when one cannot be rewritten).
Cases (a flow or a measured check for each; FIRST show today's behaviour on the head):
 1. Every place a real wish's photo is drawn (the player on /w, the owner's wish and its preview, the maker's
    tray and strip, lists and covers, friends' photos on a group wish, the render page, the Vault and a reveal,
    staff reads that show a photo): the picture element asks for the size that fits its drawn box (srcset and
    sizes from `variants`, or the nearest width up: w320 for a thumb, w768 for a phone-wide photo, w1600 for a
    full-bleed photo on a large screen), never the full-size copy when a size exists. Measure on five screens at
    390 and 1440: the bytes fetched for photos before and after (network log), and that no drawn photo is
    upscaled past its natural width (blurry) at device pixel ratio 2 and 3.
 2. `sized: false` (the sizes are not made yet: the first seconds after an upload): the full-size clean copy shows
    and nothing breaks; when the read is fetched again the sizes are used. No layout shift between the two
    (width and height or an aspect box held).
 3. The render page (the video maker reads it at 1080 x 1920): it uses w1600 (or the full copy where a photo is
    drawn larger than 1600 px), and it says ready only after EVERY photo and font of the wish has loaded and
    decoded (a check found a late photo is only in the frames when the page waits): prove with one slowed photo.
 4. Pickers: every file input that takes a photo (list each: the maker, a friend's photo, the Vault, the brand
    logo, a creator's files, Studio) lists the kinds the server takes and no HEIC or HEIF; a HEIC picked anyway
    (drag and drop, or a phone that hands one over) shows the server's words beside the tray, not a spinner
    without end; the 503 words show with a "Try again" that confirms again without a second upload; a refused
    voice or clip shows its words. Each control: hover, focus-visible, active and disabled states measured.
 5. A photo whose address has expired mid-session is fetched again through the read (as today): unchanged.
 6. No screen draws a broken picture for a photo the server could not open (a legacy file): the server's words.
Checks: `npx tsc --noEmit`; `npm run lint`; `npm run gates` (0 new: fix the code, never the gate or its baseline);
`npm run test:client`; the flows you changed or added under scripts/live/flows (name them: w10d-*.mjs) green on your
stack, and the existing photo flows (name which you ran). No horizontal overflow at 360 and 390 on the screens you
touched; one light/dark picture pair per changed screen into build/verify/web-10d/. Commit on web-10d; do not push;
stop the stack by PID; remove both worktrees; drop your databases. Hand back ONCE in 10 lines: head; each case with
its numbers; every picker listed; what was NOT run.
