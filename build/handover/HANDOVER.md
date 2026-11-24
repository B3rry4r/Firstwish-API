# Firstwish build: handover (written 24 Nov 2026)

Read this first in a new chat. It says what is being built, where everything is, what is done, what is half done,
what comes next in order, and the rules the owner has set. The last section, "State at the stop", is the newest.

## 1. What this is

Firstwish (firstwish.moxnafrica.com, Moxn Africa): "wishes" made from photos and words, sealed until a moment and
opened on a phone. The owner is the founder. Two repos, one work branch in each:

| repo | local path | GitHub | branch (the ONLY one a session may push) |
|---|---|---|---|
| web (Next.js 16, React 19) | `/home/user/Firstwish-web` | `B3rry4r/Firstwish-web` | `claude/sleepy-mayer-f0hkb8` |
| server (NestJS 11, Prisma 6, PostgreSQL 16, Redis + BullMQ) | `/home/user/Firstwish-API` | `B3rry4r/Firstwish-API` | `claude/sleepy-mayer-f0hkb8` |

Live site today: https://firstwish-web.vercel.app (web commit 71113ca, the old screens with sample data). NOTHING
wired is deployed: the server is not hosted yet. Wired screens are not deployed until the server is hosted.

The governing request: build the whole backend in NestJS and wire the front end to it, following the owner's
skills (build-orchestration, contract-driven-backend, project-analysis, verification-harness, qa-audit,
frontend-surface-build) "properly and accurately". The owner's newest demand (24 Nov): the links to real services
must be REAL code, so that all the owner does is hand over API keys. No stubs, no placeholders.

## 2. Where everything is (all in the server repo unless said)

| what | where |
|---|---|
| The owner's rulings, exact words (R1 to R17) | `build/rulings.md` |
| The lead's rulings (defaults the owner may override), newest at the END | `build/rulings-phase3.md` |
| Every brief ever given to an agent (builders, verifiers, patches) | `build/prompts/` |
| Plans | `build/tasks/PHASE6.md`, `build/tasks/RENDERER-PLAN.md` (the video maker), `W15C-PLAN.md`, `TX-POOL-AUDIT.md` |
| Low findings not yet fixed | `build/sweeps/api.md`, `build/sweeps/web.md` |
| The owner's list (questions, items only the owner can give, copy audit) | `build/owner/website-copy-audit-16nov.md` |
| Rules every agent reads | `build/common-rules.md`, `build/prompts/P6-COMMON.md` |
| The contract (frozen registry, 288 endpoints; newest decision DEC-329) | `.pipeline/registry.json`, `.pipeline/declared/`, `.pipeline/env-manifest.json` |
| Follow-up rows on wired screens (956 done, 6 open) | `.pipeline/ui-align-tasks.json` |
| The full working log of the build, newest at the END (very long: read only the last 60 lines) | `build/handover/working-log.md` |
| The owner's one-screen progress board (file + the script that measures it) | `build/handover/board/` |
| The lead's merge and drive scripts (they hold the OLD temporary folder's path: change it) | `build/handover/scripts/` |
| Verifier verdicts for the newest work | `build/handover/verdicts/` |
| Work not merged yet, as patch files | `build/handover/branches/` |
| Web: gates and their accepted list (289 accepted) | web `scripts/gates/`, `scripts/gates/baseline.json` |
| Web: which screens are wired (89 of 89) | web `.pipeline-ui/wired.json` |
| Web: the live test harness (2,351 checks) | web `scripts/live/stack.mjs`, `drive.mjs`, `kit.mjs`, `flows/*.mjs` |

The board the owner reads: https://claude.ai/artifact/LBEcB94oHCu8BVW44QQb1k (a new chat cannot update that page
unless it is opened there; publish `build/handover/board/firstwish-build-board.html` again if the owner wants one).

## 3. What is done

- Screens: 89 built, 89 of 89 wired to the server and merged (web).
- Contract: 288 endpoints frozen. Database: 78 tables. Server build waves: 23 of 23 merged.
- Server follow-up rounds 11 to 23 merged, plus test-isolation fixes (P-CI-6 to P-CI-10).
- Whole live test (the real web against the real server, other services on stand-ins): 2,351 of 2,351 on web
  4ab4d39 + server 6735fcd. Not rerun since; the web and the server have both moved on (rerun it before a release).
- Last full server suite: 224 suites, 1,734 tests, green (24 Nov, at the merge of P-CI-10).
- Server CI on GitHub: green through run 497 at the last read. The web's workflow has never run (GitHub billing: owner).

### Links to real services (the owner's "no stubs" question)

Chosen by `PROVIDERS=live|standin` in `src/common/ports/providers.module.ts`. Real code EXISTS and is bound for `live`:

| service | real adapter | run with real keys? |
|---|---|---|
| Payments, refunds, payouts | Paystack (three adapters) | never |
| Email (every message is email: no SMS, no WhatsApp) | Resend | never |
| File storage | S3 kind (Cloudflare R2 or DigitalOcean Spaces) | never |
| AI writing | Anthropic | never |
| Sign-in with Google | Google OIDC | never |
| Photo check (kind and size) | in the app | n/a |
| Clip length | ffprobe on the server | n/a |
| Photo resizing and cleaning | sharp (`SharpImageSizes`), merged 24 Nov | n/a |
| Voice and clip cleaning (location tags) | ffmpeg (`FfmpegMediaClean`), merged 24 Nov | n/a |
| The portrait video of a wish | `ChromiumVideoRenderer`: BUILT, NOT MERGED (section 5) | never |

Until the video maker is merged, wired and proved, `PROVIDERS=live` uses `NoVideoRenderer`, and by rulings IK3 and
IK3a NOTHING whose price includes the video is sold. That is a release blocker, not a stub handed out as real.

## 4. Rules the owner has set (still in force)

- R10: nothing is stored in the browser (no localStorage, sessionStorage, IndexedDB).
- R11: no SMS or WhatsApp providers; every message by email; sign-in by email code or Google. R12: email is Resend.
- R13: dictation uses the browser's own; no audio goes to any AI.
- R14: creator payout threshold ₦5,000, monthly on the 5th, PROVISIONAL, changeable in admin Prices.
- R15: contact email moxnafrica@gmail.com, WhatsApp +234 810 534 0452.
- R16: the owner will give Paystack test keys and the Anthropic key later; has a DigitalOcean account.
- R17: EVERY agent (builder, checker, patch) runs on Sonnet, set on every spawn. No Opus or Fable agents.
- The owner wants SHORT messages in plain words and a one-screen progress board (no scrolling on a phone).
- Copy: say "kind" (never format, category, type); never "forever", "launch", "coming soon", "abroad",
  "diaspora"; no emojis; no dead controls; no native browser controls; no mock or simulated server logic.
- Nothing is "done" until it works against the real backend. No pull request unless the owner asks.
- 24 Nov: the weekly usage limit is nearly spent. Spawn nothing until the owner says go.

How the build is run (the owner's skills): the lead orchestrates, rules and merges and writes NO task code; a
builder agent builds; a SEPARATE verifier agent checks (tiers T0, T1, T2); at most 2 fix rounds, then the lead
rules or re-cuts; agents never push (the lead merges local branches and pushes the one work branch); at most TWO
browser or stack jobs and ONE other job at a time on this machine (it restarts when overloaded). The lead never
edits a gate, a gate's settings or a baseline entry to get green (a gate change is the owner's). When an agent's
session refuses a command and it asks the lead to run it instead, the lead does NOT, and tells the owner.

## 5. What is half done (pick up here)

### The video maker (9 tasks; plan `build/tasks/RENDERER-PLAN.md`)

| task | what | state |
|---|---|---|
| R1 | the job hands back a file through a port | merged |
| R2 | the web's shared stepped clock | merged |
| R3 | the one-use render token and `GET /v1/render/:token/wish` | merged |
| R3B, R3C | test-only stand-in token file and hold file | merged |
| R4 | the web's render page `/render/[token]` | merged (ruling IK8) |
| W18 | the clock raises timer errors, freezes from a given start, served at `/render-clock.js` | merged (web 04f7980) |
| R4C | every one of the 43 styles x every ending plays clean under the render page | built (web branch `r4c`), in check: see section 9 |
| R5 | `ChromiumVideoRenderer`, the real recorder | built (server branch `r5`), two fix rounds: see section 9 |
| R6 | wire it: the binding, its own worker process, losses, limits, the staff line, an end-to-end proof | brief written (`build/prompts/R6.md`), NOT started; needs R5 merged |
| R7 | erase and refund cleanup | mostly landed with R1 and R3; re-scope after R6 |
| R8 | server notes (4 GB machine, Chromium, ffmpeg, fonts) | not started |
| R9 | proof on the real server, then the video is sold | not started; needs the owner's server |

Rulings for the recorder: IK6 to IK6g (end of `build/rulings-phase3.md`). Measured here: an ordinary style takes 6
to 8 minutes for a 60-second video; a 3D style (owambe) about 1.3 seconds a frame, so about 39 minutes: a question
for the owner when the server is chosen (bigger server, longer wait, or a shorter video for those styles).

### Photos on the screens (web)

The server now hands out clean copies and three sized copies of each photo (round 23). The web does not use them
yet. Brief written, NOT started: `build/prompts/WEB-10D.md` (screens ask for the size that fits; the render page
waits for every photo and font; pickers take no HEIC; the "try again" words). Spawn it after R4C is merged (same files).

### Open follow-up rows (`.pipeline/ui-align-tasks.json`)

UA-149; UA-715 and UA-716 (need the owner's keys); UA-725 (needs the real video maker); UA-875 (which real
reveal replaces the sample link: owner); UA-896 (what makes a style "featured": owner).

### The web gate's accepted list

289 entries accepted in `scripts/gates/baseline.json`; "old sample data and colours removed" stands at 237 of 526.
The rest needs the owner: may the style lab be deleted (O1), 34 gate-wrong entries (O2), the sample link (O3),
the 248 colours inside the style packages (O4).

## 6. What comes next, in order

1. Finish R5: read section 9; give its last fix round a short re-check by a separate Sonnet verifier; the lead
   then merges or re-cuts (no third fix round). Merge with the lead's full check (section 7).
2. Merge R4C if its check said MERGE (section 9), then spawn WEB-10D.
3. Spawn R6 (`build/prompts/R6.md`) from the server head that has R5; verify (T2); merge.
4. R7 re-scope, R8 notes. A whole live test (`build/handover/scripts/lead-drive.sh`) after the web merges.
5. Phase 7: the server smoke test. Fetch, at the bytes, the five photo readers the round 23 check only read in
   code (feed cover, a friend on a group wish, a business's client read, the wish video download, the data export).
6. Phase 8: the live check with the owner's real keys and server (section 8), then R9, then release.

## 7. How the lead merges and checks (no agent needed)

Server (in a worktree of the server repo, called lead-int-7 in the log; make one with `git worktree add`):
`git checkout -B p-mergeN claude/sleepy-mayer-f0hkb8; git merge --no-ff <branch>`; then run
`build/handover/scripts/merge18.sh <worktree> <logprefix>` with `TEST_DB_PREFIX=leadN` (npm ci, prisma generate,
seed export, tsc, lint, `scripts/gates.sh`, check-contracts, check-drift, check-routes, the FULL suite at 2
workers; about 15 minutes; its log ends DONE). All `EXIT 0`: merge p-mergeN into the work branch in the main
clone, push, delete the branches. Then in the web: `API_DIR=<worktree> npm run contracts:check` (or
`contracts:sync` + `npx tsc --noEmit` + commit when the registry changed). The last merge run was m49; next is m50.

Web: `git merge --no-ff --no-commit <branch>`; check no `tsconfig.json`, `scripts/gates/**`,
`.pipeline-ui/wired.json` or `public/previews` file is staged; commit; run `build/handover/scripts/webmerge.sh
<logprefix>` (npm ci, tsc, records, gates, baseline check, client tests, contracts, lint, css, build; ends DONE);
push. After a web merge that touches `lib/`, run the seed exporter in the server worktree:
`WEB_REPO=/home/user/Firstwish-web node scripts/export-seed-data.mjs`.

Tests on the server run ONLY through `npm test -- ...` or `npm run test:affected -- ...` (never `npx jest`: it
skips the test database set-up). Local services after a machine restart: `pg_ctlcluster 16 main start`;
`redis-server --daemonize yes --dir <a folder>`. One test can pass its time limit when the machine is loaded
(load 7 to 8): rerun the suite alone before believing a red.

Commit messages end with a `Co-Authored-By:` line and a `Claude-Session:` line (the new session's own).

## 8. Only the owner can give these

Paystack test keys; a Google sign-in client ID (the owner asked for a walk-through); the Anthropic key; a Resend
account and DNS records for the sending domain; a DigitalOcean server (4 GB for the video worker; Chromium,
ffmpeg and ffprobe installed); an R2 or Spaces bucket; the domain; GitHub billing (the web's CI has never run).

Questions asked and not answered (the lead's defaults stand until the owner says otherwise; all are in
`build/owner/website-copy-audit-16nov.md`): should the receiver of a resting wish also get the video file; the
248 style colours; the 34 gate-wrong entries; may the style lab be deleted; which real reveal replaces the sample
link; what makes a style "featured"; a cap on unpaid Concierge briefs; a limit on buying five more photos;
another length than 60 seconds for the status video; take-downs at once or within 24 hours; the "prepaid three
months" line in the Pro terms; a public creator page; the 30-day figure for unpaid Concierge order files; light
or dark for the /g and /w pages; VAT and copy questions; what to do about slow 3D styles in the video maker.

Never run against a real provider by anyone: every adapter in section 3. Real fonts were never measured (Google
Fonts is blocked on the build machine). Real Vercel ISR was never run.

## 9. State at the stop (24 Nov 2026, about 16:45 UTC)

The owner said: finish the running jobs, spawn nothing more (the weekly limit is nearly spent), write this folder.

- Nothing is running. No agent, no server, no browser. The hourly check (scheduled task "Firstwish build check",
  `trig_01UZnQfsw4nyGgQ1mfmfu3QA`) is switched OFF (not deleted).
- Pushed and clean: web `2f1cdc8`; server: the commit that holds this file. Both on `claude/sleepy-mayer-f0hkb8`.
- The build machine is temporary. Local branches and the temporary work folder are LOST when it goes. Everything
  needed is in this folder; the two unmerged pieces are patch files:

| unmerged work | patch (in `build/handover/branches/`) | apply with |
|---|---|---|
| R5, the recorder (server; base 992efe4, head 725d21c; 3 files, +1,782) | `api-r5-from-992efe4.patch` | `git checkout -b r5 992efe4 && git am < the patch` (then merge onto the work head) |
| R4C, the 43-style recording test (web; base 88bcd46, head a770810; 18 files) | `web-r4c-from-88bcd46.patch` | `git checkout -b r4c 88bcd46 && git am < the patch` |

### R5, the recorder: built, two fix rounds done, NOT merged, NOT re-checked after the last round

Verdicts of both checks: `verdicts/r5-VERDICT.md`. Ruling IK6h says what happens next (no third fix round).

- Claimed fixed in the last round, not yet tested by a separate verifier: the browser is driven through a private
  pipe (no listening port, so no other program can read the token); a killed server program leaves no browser,
  ffmpeg or port; a picture or font that never arrives fails the recording in words (limit 30 s); the proxy asks
  for a per-recording secret (407 to anyone else); plain words for two raw errors.
- Still OPEN (the builder said so itself):
  1. A real wish is still not repeatable: two recordings of the same content differ in 106 of 160 frames. The
     clock now stays at 0 until the page is ready, and a stand-in page gives 0 differing frames, so the cause is
     in the web's render page (an entrance that starts by real time). Not located.
  2. A Studio wish NEVER becomes ready with the clock at 0: it waits on a 120 ms interval (web
     `components/engine/made/StudioHost.tsx:96`; `components/render/conduct.ts:61` needs `.mk-studio-over`, drawn
     after it at :165; a 90 ms debounce at :105). Every Studio recording fails with words after 150 s. Needs a
     web task: the render page must become ready with no time passing.
  3. After a kill -9 a temporary profile and work folder stay on disk (R6's leftovers sweep is written to clean them).
  4. Not run: an https CONNECT through the proxy with the secret; film and Studio repeatability; the full suite.
- Next step: a short re-check (fresh Sonnet verifier) of the claimed fixes; on a pass merge r5; cut the web task
  for points 1 and 2; then R6 (`build/prompts/R6.md`).

### R4C, the 43-style test: built, checked, verdict FIX FIRST, NOT merged

Verdict: `verdicts/r4c-VERDICT.md`; five frames in `verdicts/r4c-pics/`. Ruling IK8a says what must not be drawn.

- Held: 95 of 95 cases end with no page error (also on the new clock); no play is over 60 s (longest 47 s);
  receivers lost nothing.
- To fix (one patch round by a fresh Sonnet builder on branch r4c, then a re-check that LOOKS at frames):
  "Touch the star" in `stage/tinsel/endings/candle.tsx:238` and `stage/constellation/endings/candle.tsx:166`; the
  send arrow and reply bar in `stories/group-chat/Scene.tsx:614-624`; an empty white pill in the group-chat
  envelope ending; a pull cord left in the lullaby candle ending; "Hold to light the runway" in
  `boarding-pass/endings/candle.tsx:363` (not proven absent); page counters and pips (polaroid-table, mixtape,
  midnight, mosaic). The sweep's word list misses any cue outside its seed words and cannot see shapes.

### Ready to start, not started (briefs written)

- `build/prompts/R6.md`: wire the recorder (needs r5 merged).
- `build/prompts/WEB-10D.md`: screens use the sized photos; pickers without HEIC (start after R4C merges: same files).

### Things a new chat should know before it spends anything

- Every agent on Sonnet (R17). The lead writes no task code. At most two browser jobs and one other job at once.
- This session's safety check refused three things; none was worked around: editing the web gates' settings
  (22 Nov: a gate change is the owner's); stopping a leftover browser by its whole process group together with
  deleting its folder (24 Nov: a plain stop of the one process was allowed); and, inside agents' sessions, some
  repeated test runs, a loop with `rm -rf`, and `git worktree remove` (those steps are marked NOT RUN where they
  matter: the cause of a one-off failure of `ab22-sizes-job.spec.ts` (confirm answered 422 once) is still unshown).
- Three worktrees of the last checker may still be on the machine (`build/wt/v-r4c*` under the temporary folder).
