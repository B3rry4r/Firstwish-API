PATCH P-SEED | TIER T0 (a script, a record, a test; no route, no schema) | Budget 30 steps. The seed export reads web files the web has deleted.
Read /home/user/Firstwish-API/build/common-rules.md. scripts/export-seed-data.mjs draws three reference sets from the web's lib/admin/d-fixtures.ts
(savedReplies, settings.providers, templates: lines ~127-140). The web deleted that file when its staff screens were
wired to this API (the fixtures are gone for good), so `WEB_REPO=/home/user/Firstwish-web node scripts/export-seed-data.mjs` now fails
(ENOENT), and src/modules/reference-data/tests/reference-data.spec.ts fails on web-file hashes whenever a web
checkout is present (CI has none).
Work: a new worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-seed of /home/user/Firstwish-API on a new local branch `p-seed` from claude/sleepy-mayer-f0hkb8 (`npm ci`; prisma
generate); TEST_DB_PREFIX=pseed. Run every command with your own worktree as the working directory. Read the web
only at /home/user/Firstwish-web (never write there).
 1. Those three sets are now OWNED by this repo: their recorded files under prisma/seed-data/ stay byte for byte as
    they are (the receipt and refund templates the seventh round added included); the export no longer reads a web
    file for them and never rewrites them; prisma/seed-data/SOURCE.json says, per set, "owned here since 17 Nov
    2026 (the web's fixtures were removed)" in place of a web file and hash.
 2. Every other set is still drawn from the web files that exist; list any other web file the export reads that the
    web head no longer has (fix it the same way only if its data is recorded here; else report it).
 3. The export passes against the web head and changes nothing but SOURCE.json's hashes for web files that really
    moved; the seed (run twice) writes the same rows as before (count each of the three tables before and after).
 4. reference-data.spec.ts passes with the web checkout present AND with WEB_LIB=/nonexistent/lib.
Checks (quiet logs, EXIT lines): typecheck, eslint on changed files, gates.sh, check-contracts, check-drift, the
reference-data spec both ways. Commit on p-seed; do not push; remove your worktree and databases; leave no
background jobs. Hand back ONCE in 6 lines: head; items 1-4 with file:line; EXIT lines; `git diff --stat`.
