# RENDERER PLAN (audit, text only; nothing run, nothing changed). Paths: API = /home/user/Firstwish-API, WEB = /home/user/Firstwish-web
Read: render-jobs/**, jobs.service.ts, providers.module.ts, product-truths, env-manifest, rulings R9-R16, IK3/IK3a, web player and previews.mjs.

## 0. What exists (evidence)
- Port: `VideoRenderer {configured, ping, render(RenderRequest, signal) -> {bytes, contentType}}` API video-renderer.ts:3-27. `RenderKind` is only
  status-video | keepsake-export (:3); the DB enum and wire type also hold `premiere-clip` (schema.prisma:2460, types.ts:1383, service.ts:117) but
  SPEC (service.ts:19-22) and `ask` (:72) never make one. Production binds `NoVideoRenderer` (render-jobs.module.ts:13); ping says error.
- Job: ask -> RenderJob row queued -> jobs.schedule("render-video") (service.ts:62-90); run() claims the row (:98), render, `files.write` (:108), done/failed (:109-112).
  A failed job is asked again on the same row. Bytes are a whole in-memory Buffer (video-renderer.ts:15): a 60 s 1080x1920 file is tens of MB.
- Jobs: MAX_TRIES 5, backoff 30 s doubling (jobs.service.ts:12-14), LEASE 10 min (:16), time limit per kind from job_kind_config, DEFAULT 60 s (:19).
  RENDER_LEASE_MS is also 10 min (service.ts:24). RENDER_CONCURRENCY exists in env.schema.ts:54 (default 2), read by no source (manifest :216).
- Ports are chosen by PROVIDERS in providers.module.ts; the real adapter needs env (`need()` :38, `limited()` :40, timeouts in time-limit.ts). The video
  port is NOT in that module: it is hard bound in render-jobs.module.ts:13, so no env check exists for it. Precedent for a missing real adapter: ImageSizes (:98).
- Rulings: IK3/IK3a (rulings-phase3 end): nothing that includes the video is sold until a renderer is configured; release blocker. IK4a: erased wish or
  refunded extra gives no video/download. R9 "leave the preview videos quality as is" covers the 390x844 list previews only (WEB scripts/previews.mjs:22,44),
  NOT this 1080x1920 file; do not touch previews. R11: no WhatsApp provider, the owner shares the file by hand. R13: no audio to AI. R16: owner has a DigitalOcean account.
- Web player: `Showcase` reads the link, passcode/opening go to the server, content only arrives once unlocked (Showcase.tsx:35,88-96); `Host.tsx` plays
  opening, style, ending; voice/song play only after a tap (Host.tsx:140-149,311). Fonts come from Google Fonts (app/layout.tsx:25-29).
- Proven recipe in the web: previews.mjs puts a virtual clock before page scripts (Date, performance.now, timers, rAF, CSS animations all frozen and stepped
  1/30 s, :60-205), captures each frame by CDP `Page.captureScreenshot` jpeg (:247), passes the opening by a tap (:275-302), encodes with ffmpeg H.264 (:362). Tool: Playwright + Chrome, 30 fps, 390x844, software WebGL.

## 1. What a portrait video is, by kind
Size 1080x1920, 30 fps, H.264 MP4, no sound in v1 (default below). From SPEC: status-video 30 s, keepsake-export 60 s (service.ts:19-22).
| Kind | Plays | Length | In | Out |
|---|---|---|---|---|
| status-video (Signature, Premiere, extra; T-04, T-30) | the wish as its style plays it | 30 s, cut | opening ANIMATION only (not the lock), scenes, ending drawing | gate, countdown, passcode/question input, controls, menus, keep offer, "Ask again" UI |
| keepsake-export (resting wish; T-49, T-58) | the whole wish, no cut | up to 60 s | as above, the ending's question shown unanswered | same |
| premiere-clip (T-05: three 15 s clips; extras 15 s and 60 s, T-30) | NOT designed: see owner questions | 15 / 60 | - | - |
Defaults proposed (lead may override): the ending question is drawn as an unanswered card (no reaction can be sent from a file); a wish longer than 30 s is
cut at the last whole scene before 30 s, never mid-word; a wish shorter than the length ends at its ending plus 1.5 s hold, so length is a maximum.
Nobody decided: (a) what a "Premiere clip" is (a cut of the user's own video uploads? T-05 says "video clips", the renderer sells none; `kind: "video"`
file exists, types.ts:442); until decided, build NO premiere-clip render (keep it unsold). (b) T-04 says Signature has "no video" in one clause and
"portrait video" in another, T-08 says video is Premiere only, yet IK3a sells it with Signature: product-truths T-04/T-08 conflict (owner, money). (c) 30 s: WhatsApp's status limit
is believed to be 30 s (not checked here). (d) Sound: Host plays a voice note or song after a tap only. Defaults: v1 silent; a voice note may be
muxed in v1.1; a song LINK is never muxed (T-56: public wishes may not carry the sender's song; a link is not a file). Owner question only if v1.1 wanted.
(e) Who may ask the keepsake export: the controller is owner-only (controller.ts:17,25); T-49 says "both people" (receiver has no account): not found in the code, owner question.

## 2. How to render: options
| Option | Needs from web | Needs from server | Risk |
|---|---|---|---|
| A. Headless Chromium on the worker plays the web's own player, frame by frame, ffmpeg encodes | a /render route, the virtual clock shim, "done" signal | worker, Chromium, ffmpeg | animation timing (solved by the shim), memory |
| B. Browser screencast (CDP `startScreencast`, or recordVideo) | same route | same | real-time, frame drops, jitter on a small droplet; not deterministic |
| C. Remote render service | same route, plus a vendor | vendor key, fee, privacy of photos | new money, new provider, owner decision, R10-style privacy |
| D. Rebuild scenes outside the browser | duplicate every style, the Studio's made styles, WebGL | big | never matches; reject |
RECOMMEND A, as an in-process adapter `ChromiumVideoRenderer` behind the existing port, run as its own worker process. Reason: previews.mjs already proves
the exact method on every style (virtual clock, frozen CSS animations, same recorder), so the file looks like what the receiver sees, and it adds no vendor.
Do not copy previews.mjs; extract its clock shim and frame loop into a shared module (task R2) so previews and renders cannot drift.
Web needs: route `app/render/[token]/page.tsx` (no gate, no ShowcaseMenu, no keep sheet, no fonts wait beyond `document.fonts.ready`), sets `window.__render = {ready, done, error}`;
it loads the wish through one read: `GET /v1/render/:token/wish` returns the same content and signed photo addresses the link gives after unlock (adapt.ts fromServed),
with the opening forced open (Showcase.tsx:35 `played` is the pattern), plus a style and the Studio style document where one is held.
Server needs: worker process (second Nest entry: jobs only, no HTTP; or the same app started with a flag) so web traffic never shares memory with Chromium; one
job at a time; queue is the existing `job` table, claim is SKIP LOCKED (jobs.service.ts:125-143), no new queue.
Size on one droplet (ESTIMATES, unmeasured here): 4 GB / 2 vCPU: Chromium with software WebGL about 1-1.5 GB; set RENDER_CONCURRENCY=1 (the default 2 is too many for 4 GB);
speed 3-10x real time, so 30 s takes 2-5 min, 60 s up to 10 min. Frames stream to ffmpeg over stdin (image2pipe), never to disk (900-1800 jpegs of about 300 KB).
Time limit and retries: add a job_kind_config row render-video of 20 min (default 60 s would kill every run, jobs.service.ts:19); raise RENDER_LEASE_MS and LEASE_MS to
more than the limit (both 10 min today and a 10 min render would be taken twice); keep MAX_TRIES small for this kind (2: a render that fails twice is the style's fault, then park
for staff). The port already has failure: any throw -> status failed, owner presses Ask again (service.ts:111). Pass the AbortSignal to Chromium and ffmpeg and kill both on abort.
Memory: `RenderedFile.bytes` is a Buffer; change to a temp file path or stream (task R1) before 60 s files.

## 3. Privacy and safety
- Render token: minted by the server in run(), bound to wishId + jobId, one use (consumed on the wish read), valid 15 min, stored hashed (like passcodes), no scope but "read this wish for render". Not a session, not in the URL logs of anyone else (worker only).
- Photos: signed addresses with a lifetime of the job limit plus margin (about 30 min), made for this render only.
- Worker may reach only: the web origin, the API render route, the storage host, the font host. Chromium started with a host allowlist (`--host-resolver-rules`) and no cookies,
  no extensions, a fresh profile per job, deleted after. No other site, no metadata address (169.254.169.254).
- Passcode/question wish: the owner asked, so the video shows the letter without the lock; only the owner reads the file (GET owner-only, short-lived signed download address, IK4).
  Default (lead): the ask screen says "This video shows your wish without its passcode." The receiver never gets the file through any link.
- Erase: the render file is a server file owned by the account; the erase-wish job must delete outputFileId and the RenderJob row (check purposes "render" and "export", server-files.ts:12);
  a job running when the wish is erased re-checks `erasedAt` before writing and writes nothing (IK4a). A refunded extra gives no download (IK4a): same check.
- Logs never carry the token, photo addresses, or letter text.

## 4. Tasks (builders; Sonnet, R17). Size in agent steps, rough.
Order: R1, R2 in parallel -> R3 -> R4 -> R5 -> R6 -> R7 -> R8 (host). R9 last, owner-gated.
| ID | Tier | What | Files | Cases (S=stand-in, R=real Chromium) | Provable here | Needs real host | Steps |
|---|---|---|---|---|---|---|---|
| R1 | T1 | Port widened: file path result, abort, premiere-clip left unsold; `RENDER_*` env checks | API video-renderer.ts, render-jobs.service.ts, providers/env.schema.ts, env-manifest | S: file result written, abort stops, failed keeps Ask again, no bytes in memory | yes, jest elsewhere | no | 30 |
| R2 | T1 | Extract clock shim + frame loop from previews.mjs to a shared module; previews unchanged (R9) | WEB scripts/previews.mjs, scripts/lib/clock.mjs | previews output byte-compared before/after on 2 styles | yes (Chromium, ffmpeg here) | no | 30 |
| R3 | T2 | Render token + `/v1/render/:token/wish` (one use, 15 min, hashed, content with opening forced open, signed photos) | API render-jobs/render-token.*, controller, contracts, migration | S: used twice -> 410, expired, wrong wish, erased wish 404, passcode wish gives content only with token, token never in logs | partly (DB tests, not run here) | no | 45 |
| R4 | T1 | Web `/render/[token]` page: no gate/menu, `__render` signals, fixed clock hook, fonts + photos ready | WEB app/render/**, components/render/** | R: renders 3 styles (portrait scroll, swipe, film) to the done signal; no network call outside allowlist | yes (Chromium here) | fonts host reachable | 40 |
| R5 | T2 | `ChromiumVideoRenderer` adapter + worker entry: launch, allowlist, frame loop, ffmpeg pipe, cut rule, kill on abort | API render-jobs/chromium-video-renderer.ts, src/worker.ts | R: 5 s clip of a sample wish is 1080x1920 H.264, correct length (ffprobe), 30 fps; abort kills both children; failure leaves no temp files | yes: 5-10 s clip, 1 style, against a local web build run by the lead | speed and memory at 30/60 s | 60 |
| R6 | T2 | Wire it: PROVIDERS pick (standin -> Standin, live -> Chromium), `configured()` true only when binary, web origin and token secret present; ping; job_kind_config 20 min; lease and tries | API render-jobs.module.ts, jobs.service.ts, render-jobs.service.ts, migration | S: ask -> done with stand-in; configured false -> 503 and unsold (IK3/IK3a) still hold | yes | live boot | 35 |
| R7 | T2 | Erase and refund cleanup, owner-only signed download, IK4a cases, job re-checks erase | API render-jobs, wishes erase handler | S: erase mid-job writes nothing; refunded extra no download; other account 404 | yes | no | 30 |
| R8 | T1 | Droplet worker: Dockerfile/systemd with Chromium, ffmpeg, fonts; 4 GB droplet; swap; RENDER_CONCURRENCY=1 | build/deploy notes only | none | no | yes | 20 |
| R9 | T2 | Release proof: real wishes rendered on the droplet at 30 s and 60 s, time and peak memory recorded, then lead lifts IK3 | task note | R: 3 styles x 2 kinds, a passcode wish, a Studio style | no | yes | 25 |
Total about 315 steps. Add after R6 only if owner asks: premiere-clip (own plan), voice note mux (20).
Env names: PROVIDERS (existing), RENDER_CONCURRENCY (existing, set 1), RENDER_WEB_ORIGIN, RENDER_TOKEN_SECRET (or reuse the hash secret), RENDER_CHROMIUM_PATH (default /usr/bin/google-chrome),
RENDER_FFMPEG_PATH (/usr/bin/ffmpeg), RENDER_TIME_LIMIT_SECONDS (1200), RENDER_TOKEN_TTL_SECONDS (900). All but the two existing are new: add to env.schema.ts and env-manifest.json.
Machine note: here Chromium (/usr/bin/google-chrome) and ffmpeg exist, so R2, R4 and the short clip of R5 can be proved here; speed, memory and fonts-from-the-internet cannot.

## 5. Open owner questions (money, legal, brand only)
1. Signature and the video: which tickets include the portrait video (T-04 vs T-08 vs IK3a)? Today Signature and Premiere both do; confirm.
2. What is a Premiere clip, and may a customer upload video? (no render is planned until answered).
3. Should the receiver of a resting wish also get the file (T-49), and by what proof?
Not asked, defaults taken: silent video; 30 s cut at a whole scene; ending question as a card; passcode wish video has no lock, owner only.

## 6. Tell the owner (three lines)
1. The two top tickets and the video extra stay unsold until a video maker is built; this is the last big piece before launch.
2. The plan: a small helper on your DigitalOcean server opens each wish like a phone would and records it, 1080 by 1920, then stores the file; about 315 builder steps.
3. We need you to confirm three things (above) and to give us a droplet with 4 GB of memory; each video will take a few minutes to make.

## 7. Could not determine
Real render speed and memory (never measured); which fonts the Studio styles load beyond layout.tsx; whether Playwright is installed at /opt/node-tools in the worker image;
how erase-wish treats render files today (not read); how the receiver's keepsake file would be asked; WhatsApp's status length limit (from memory, not documents).

## 8. The lead's notes on this plan (23 Nov)
- Owner question 1 is NOT a conflict: in the truths "video" means the customer's own uploaded clips (Premiere only, T-05, T-08; built: the maker's
  Gather step and stored files), and "portrait video" means this rendered file for WhatsApp status (Signature and Premiere include it, Keepsake buys it:
  T-04, T-30; the entitlements book's `portraitVideo`). Nothing to ask.
- Question 2: a "premiere-clip" render is not planned and not sold; the customer's uploaded clips are not this renderer's work.
- Question 3 stays open for the owner (T-49: the receiver of a resting wish is also offered the file). Default IK6 until answered: owner only.
- "configured()" must be true only with a real adapter present, so IK3/IK3a lift themselves when R6 lands and the env is set; R9 is the proof, not a switch.
- R2 merged (web af3e031; checked by a separate verifier, 23 Nov). For R4 and R5: the clock's steps are exact, so cut at a whole scene by the page's own scene and done signal at each tick; a re-render is NOT byte for byte the same (the freeze takes its virtual start from real time): for identical re-renders install the clock frozen from the page's start (virtual now 0, a fixed Date offset, step through the load) in the RENDER path only, never in previews (R9). The module's run() has no abort argument and its ffmpeg is spawnSync (blocks, cannot be killed): R5 needs an async, killable encode and an abort. Measured here: 5 s at 1080x1920 = 28 s of work, Chromium peak 565 MB (3 s = 12 s, 720 MB in the builder's run).
- R1's check (23 Nov), for R6: the queue's tick is serial (queue.service.ts:25 concurrency 1; runDue is serial), so in one process a 20-minute render holds every other job kind and RENDER_CONCURRENCY above 1 never applies; the in-process gate is per process. The renderer must run in its OWN worker process that takes only render jobs, and the web-facing process must not take them.
- R1's re-check (23 Nov), for R6: after a "busy" return (no place) the job's attempts reset to 0, so a render lost once gets its cap of 2 again; only a worker that keeps dying between busy gaps could loop. The worker process of R6 should count losses on the render ROW, not on the job's attempts.
