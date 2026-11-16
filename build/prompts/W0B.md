BUILDER W0b | TIER T2 identity | The shared API client, the session, and the three sign-in screens on the real server
Budget 180 steps. Machine: 4 CPUs, 15 GB; heavy agent (a browser and two servers): a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/tasks/PHASE6.md, /home/user/Firstwish-API/.pipeline/conventions.md (auth model, error
envelope, format canon, Runtime contract), /home/user/Firstwish-web/AGENTS.md, .pipeline-ui/invariants.md and surface-map.json, and
/root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/frontend-surface-build/SKILL.md (Core laws, Phase 2, Phase 5) and /root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/contract-driven-backend/SKILL.md (Phase 6: the pre-step,
populate-path wiring). Endpoints and shapes: in /home/user/Firstwish-API run `python3 tools/pipeline/show.py <Resource>` for Account,
AuthCode, Session and the Google sign-in; rulings in /home/user/Firstwish-API/build/rulings-phase3.md (S1-W2, R10, R11, W1).
Owner's words: > "Nothing should be stored on the browser." (R10: no localStorage, sessionStorage, IndexedDB or cookie written by
the page; the refresh token is an httpOnly cookie the server sets; the access token lives in memory; light or dark is on the
account; a choice made before sign-in travels in the link.) > every message by email; sign-in by email code or Google; the
phone is a plain detail, never verified (R11).
Work: the WEB repo /home/user/Firstwish-web, local branch `w0b-session` from claude/sleepy-mayer-f0hkb8 (the head in your spawn line) in your
own worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w0b-session (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; ports 5180-5199; the API through
`node scripts/live/stack.mjs` with API_DIR = your own detached worktree of /home/user/Firstwish-API (/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w0b-api, `npm ci`), prefix w0b.
Do NOT edit scripts/gates/baseline.json (list the entries your work clears) or the API repo.
Cases:
 1. Contract types: a script copies the API's contracts/firstwish-contracts.d.ts into this repo (one file, never hand-edited)
    and a check fails when the copy differs from the API's; no wire shape is typed by hand anywhere you touch (law 4).
 2. The client (one module): same-origin /v1; the access token only in memory; on 401 one refresh in flight for all callers,
    then one retry; the error envelope {error: {code, message, fields, requestId}} becomes one typed error the screens show
    in plain words (field errors on their fields); an Idempotency-Key helper for writes (a UUIDv7); a kobo formatter (integer
    kobo in, naira text out); no request is retried blindly; a signed-out or refused refresh ends the session cleanly.
 3. The session: on load the app asks the server who this is (refresh, then GET /v1/me): loading, signed out, signed in, each
    a real state on screen; sign-out ends the server session; a banned or erased account sees the server's own words; two
    tabs stay in step without any browser store (say how: a BroadcastChannel is not storage; or each tab asks the server).
    lib/account.ts stops writing any browser store for identity: what other screens still read from it keeps working from
    memory until their bundles wire them (say exactly what you left and for which bundle).
 4. sign-in, sign-up, welcome on the real server: ask for an email code, enter it, land signed in; the wrong code, an
    expired code, too many tries and too many asks each show the server's answer (never a made-up message); Google: the
    button is drawn only when a Google client id is configured, and then follows the server's route (with none configured
    it is not drawn: no dead control); welcome saves the person's details to the account (PATCH /v1/me) and the theme with
    it; a choice made before sign-in (a kind, a style, a return path) travels in the link and survives the sign-in.
 5. The three screens' ui-align tasks in /home/user/Firstwish-API/.pipeline/ui-align-tasks.json (screenId sign-in, sign-up, welcome): list
    each id as done, or not done with why.
 6. The live driver counts them: .pipeline-ui/wired.json lists the three; `node scripts/live/drive.mjs` signs in through the
    real screens (it reads the code from the API's stand-in email: find how the stack exposes it; HALT AND REPORT if it
    does not) and sees the account's name that exists only on the server; "wired 3 of 89".
Measure in a real browser (numbers, not adjectives) to /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w0b-measure.txt: the three screens at 360x740, 390x844 and
1440x900: no sideways scroll, 0 console errors, every state reached (loading, wrong code, locked, signed in); after a full
sign-in and a reload: localStorage, sessionStorage, IndexedDB and document.cookie as the page sees them are all EMPTY (print
them), while the httpOnly cookie exists only in the browser's cookie jar; one light and one dark picture per screen at 360.
Checks (quiet logs, EXIT lines): typecheck, lint, check:css, `npm run gates` (exit 0; no new finding; list the baseline
entries now stale), `npm run build`, the live driver. Commit on w0b-session; do not push; remove your worktrees and
databases. Hand back in 12 lines of claims (one per line, each testable), the stale baseline entries, any HALT, and what
was NOT measured or NOT RUN (Google against Google: NOT RUN).
