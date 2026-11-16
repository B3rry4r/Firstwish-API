BUILDER W0a | TIER T1 | The web repo's gates and live harness (Phase 6 pre-step). No screen changes at all.
Budget 130 steps. Machine: 4 CPUs, 15 GB; heavy agent (a browser): a heavy job only at 5 GB available. Kill what you start by PID.
Read /home/user/Firstwish-API/build/common-rules.md, /home/user/Firstwish-API/build/tasks/PHASE6.md, /home/user/Firstwish-web/AGENTS.md and README.md,
then the two skills' files you install from: /root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/verification-harness/SKILL.md (Install, The ten gates, The baseline; assets/ and
references/per-stack.md, writing-a-gate.md) and /root/.claude/skills/synced/f85b4e60-1876-4137-a2c7-d7d119745a79_8f677423-0744-4c12-8d0d-331ba6815a77/frontend-surface-build/SKILL.md (Phase 0, Phase 1; references/invariants.md,
measurement.md).
Owner's words: > "Nothing should be stored on the browser." (R10) > no mock or simulated server logic; no dead controls; no
native browser controls; say "kind" (never format, category or type); no "forever", "launch", "coming soon", "abroad",
"diaspora" in customer copy; no emojis; Portrait and Landscape (never "sideways").
Work: the web repo /home/user/Firstwish-web, local branch `w0a-harness` from claude/sleepy-mayer-f0hkb8 in your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/w0a-harness (`npm ci`); never commit on claude/sleepy-mayer-f0hkb8 itself; ports 5100-5119. Do not edit any file under
app/, components/, lib/ or styles/ (this task changes no screen); if a gate needs a source change, list it.
 1. Install the verification harness (node variant) under scripts/gates/ with gates.config.json fitted to this repo's layout
    (app/**, components/**, lib/**, styles/**, public/sw* if any); stack "node"; print "files scanned: N" beside the repo's
    real count of source files (they must agree). Add `npm run gates`.
 2. A new gate `browser_storage` (R10), at fail: localStorage, sessionStorage, indexedDB, openDatabase, document.cookie
    writes, and the Cache API or a service worker holding anything from /v1; the quiet-gate pattern (a comment or a string
    that only names the word does not fire; say how). Tests for the gate itself (fixtures that must fire and must not).
 3. product_invariants: the owner's copy rules above as config (customer-facing copy only; staff screens under app/admin
    may say what staff need); the fake_data gate knows this repo's sample files (lib/*-fixtures.ts, lib/admin-fixtures.ts,
    sample: true rows, SAMPLE_ constants) and where a live path imports them.
 4. Do NOT run --accept and do NOT write the baseline: run the gates and write the full findings to
    /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/logs/w0a-gates-findings.txt, grouped by gate and by file, with a count per bundle of build/tasks/PHASE6.md (which
    bundle W1..W14 or W0b removes each finding: map by the screen's files in /home/user/Firstwish-API/.pipeline/scan-map.json).
    The lead adopts the baseline.
 5. frontend-surface-build Phase 0 and 1: .pipeline-ui/invariants.md (each rule with its executable check), and
    .pipeline-ui/surface-map.json (every route AND every sheet, drawer and dialog a route crawl cannot see, with how to
    reach it; breakpoints as configured; primary device phone, narrowest 360 x 740).
 6. The live harness: Playwright (already on this machine: require('playwright'); do not install browsers) under
    scripts/live/: `node scripts/live/stack.mjs up|down` starts the API (/home/user/Firstwish-API scripts/stack.sh on its own prefix
    and port, with stand-ins and a fresh seeded database) and this app (next dev or a built start) with API_ORIGIN set, and
    a driver that (a) proves the two are up, (b) reads a value that exists only on the server through the app's origin
    (/v1/health or the price book through the rewrite W1: add ONLY the Next rewrite /v1/:path* -> API_ORIGIN in
    next.config.ts, nothing else), (c) measures horizontal overflow at 360 and 390 on three public routes, (d) fails
    honestly with "NOT WIRED: <route>" for a screen whose data still comes from the browser (a list read from the scan
    map), so the count of wired screens is a number the harness prints (0 of 89 today). No screen is changed.
 7. CI for the web repo (.github/workflows/web.yml): install, typecheck, lint, check:css, gates (exit 2 is a failure),
    build. The live harness is a separate job that does not run on push yet (it needs the API): leave it callable by hand.
Checks (quiet logs, EXIT lines): typecheck, lint, check:css, `npm run build` (save and restore tsconfig.json if the build
edits it), the gates' own tests, the harness's up, driver and down (nothing of yours left on your ports: `ss -ltnp`).
Commit on w0a-harness; do not push; remove your worktree. Hand back in 12 lines: head; files scanned; findings by gate
(counts) and by bundle; what the live driver measured; what is NOT RUN and why; anything a gate needs changed in source.
