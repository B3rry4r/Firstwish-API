AUDIT RENDERER | TIER T1, text only (no server, no browser, no jest, no npm ci) | Budget 60 steps. You change no source file. One output file: a plan.
Why: the server sells a portrait video (inside the Signature and Premiere tickets, as an extra, and as the file of a resting wish) and
has NO real video renderer: src/modules/render-jobs/video-renderer.ts binds NoVideoRenderer in production (rulings IK3, IK3a at the END of
/home/user/Firstwish-API/build/rulings-phase3.md: nothing that includes the video is sold until one exists; it is a release blocker).
Read (do not switch branches; do not make a worktree): in /home/user/Firstwish-API: src/modules/render-jobs/** (the port: RenderRequest {wishId, kind, width, height,
seconds} -> bytes; the kinds status-video 30 s, keepsake-export 60 s, premiere-clip; the job, the stored file), the jobs module
(how a job runs, its time limit and retries), src/common/ports/providers.module.ts (how a real port is picked and env is checked),
.pipeline/product-truths.json (every truth that names the video, the Premiere clip, WhatsApp status), .pipeline/env-manifest.json,
build/rulings.md R9 ("leave the preview videos quality as is") and R10, R11, R13, R16 (the owner has a DigitalOcean account).
In /home/user/Firstwish-web: how a wish plays (components/engine/**, components/wish/**, lib/engine/**: the player, its timeline,
scenes, opening and ending moments, fonts, photos by signed address, a creator's Studio style), app/w/[slug], and how the
existing preview recordings of styles were made (scripts/** that record: name the tool, the size, the frame rate).
Answer in the plan, with file:line evidence:
 1. What a "portrait video" must be for each kind (what plays, how long, which moments are in or out: the gate, the
    countdown, the opening, the ending question), by the truths and rulings; list what NOBODY has decided (owner questions,
    only where a money, legal or brand matter: otherwise propose a default).
 2. How to render it: the options (a headless Chromium on the server recording the web's own player at 1080x1920 through
    frames + ffmpeg; the browser's screencast; a remote render service; rebuilding the scenes outside the browser) with what
    each needs from the web (a render route that plays one wish deterministically from a signed, short-lived render token,
    with no gate, no controls, a fixed clock and a "done" signal; fonts and photos reachable by the worker), from the
    server (a worker process and queue, memory and time per video, how many at once on one small DigitalOcean droplet, the
    job's time limit and retries, the failure states the port already has), and its risks (animation timing, audio: is
    there any sound in a wish video? voice notes and song links: say what the truths allow). Recommend ONE.
 3. Privacy and safety: the render token (one wish, one use, minutes), what the worker may reach, that a passcode
    wish's video never leaks the letter to anyone but the owner, erase (the file goes with the wish).
 4. The tasks, cut for builders: each with tier (T1/T2), files, cases to test (stand-in versus real), what can be
    proved on this machine (Chromium and ffmpeg are installed here) and what needs the real host; the order; the env
    names; a rough size (steps) for each. Also what to tell the owner in three plain lines.
Output: /home/user/Firstwish-API/build/tasks/RENDERER-PLAN.md, 140 lines or fewer. Do not commit; do not push. Hand back ONCE in 10 lines:
the recommendation, the task list with tiers, the open owner questions, what you could not determine.
