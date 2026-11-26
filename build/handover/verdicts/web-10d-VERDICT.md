VERDICT WEB-10D (web-10d d37b48a vs dae0324; API c72e6d7): FIX FIRST
Evidence: $S/build/verify/w10d/ real2.log (real stack, 3 x 2400 px JPEGs via the maker), flows.log, static.log, r4-head.txt, pics/.
HIGH
1. Owner screens draw the FULL copy where sizes exist. Real stack, server sends variants (3, all sized) on GET /wishes and /wishes/:id, but
   components/app/life/WishCard.tsx:37-42 (Thumb -> SizedImg) is never registered: registerPicture is called only in lib/files.ts:52 (draft) and
   lib/engine/adapt.ts:249 (public). Owner wish, owner list, home: a 92 to 104 px thumb fetches 4,366,474 B (nat 2400) at 390@2x and 1440@1x;
   owner wish at 1440 (280 px box) too. Expected w320. Same for any list read not passed through setServedPictures (Studio, Vault, Moderation:
   server sends no variants there in the diff; full copies expected, not listed per screen). Builder's w10d-sizes mocks the reads, so it cannot see this.
2. On this real stack every sized variant url answers 404 (curl, public and owner reads; .w320/.w768/.w1600; the full url 200) although the
   view says sized:true. /w at 360, 390@2x/3x, 1440@1x/2x: 3 of 3 photos BROKEN (nat 0) in every view. Cause is on the API/stand-in storage side
   (not found in the web diff), but SizedImg (components/SizedImg.tsx:34-37) has no onError fallback to sizes.base, so one bad size = broken photo.
   Either fix is needed; real-stack /w could not be measured for bytes (0 images fetched).
MEDIUM
3. Builder's own numbers show double fetches on /w: p2 and p3 fetched at w1600 AND at w768/w320 (flows.log: "p1:w1600,p2:w1600,p3:w1600,p2:w768,p3:w768",
   3.85 to 3.99 MB, not the minimum). Source of the stage-size fetch not traced (lib/pics.ts stage() / adapt.ts).
4. scripts/live/flows/r4.mjs "ONE read ... only allowed requests" FAILS for film and studio (stray=5 standin-storage wish-photo urls, 0 signed
   files; film also withReferer=1 from a css file): the allow-set does not know the new variant urls. Not compared with base (no base stack run).
PASSED: tsc 0; gates 0 fail 0 warn (289 accepted); test:client 12/12; lint 769 warnings (0 errors); check:css; next build; w10d-pickers 13/13 and
 w10d-sizes 27/27 and w5-maker2 0 failed on my built stack; sweep 10 styles (pinboard mosaic polaroid-table gallery contact-sheet scrapbook lookbook mixtape
 cinema group-chat) all done and clean, 0 console errors; no tsconfig, gates or baseline in the diff; storage empty in every page measured.
Pickers: maker #fm-file jpeg,png,webp,gif; vault page, vault/[id] x2 VAULT_KINDS (those four + mp4,quicktime,webm); brand logo png,jpeg,webp; Studio
 ACCEPT_UP.image same four; friend input audio/* (voice only). None offers HEIC or HEIF. 503 then Try again: tickets 1, puts 1, confirms 2.
NOT RUN: base stack comparison of bytes and of the sweep; HEIC drag and drop on the Vault (needs a business account); friend photo on a group wish;
 Studio and staff Moderation fetch counts; light/dark pair of my own (builder's pairs in $S/verify/web-10d/ cited, not re-shot); real-stack render at w1600
 with real sizes (variants 404 there); Remove/Add active state on real stack beyond the flow's checks.
