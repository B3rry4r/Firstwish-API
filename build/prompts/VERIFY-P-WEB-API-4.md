VERIFIER P-WEB-API-4 re-check | TIER T2 short | Budget 45 steps. Only the patch's four findings and what its fix could break.
Machine: 4 CPUs, 15 GB; a heavy job only at 5 GB available. Read /home/user/Firstwish-API/build/prompts/P6-VERIFY-COMMON.md (rules) and the patch
brief /home/user/Firstwish-API/build/prompts/P-WEB-API-4.md. Under test: /home/user/Firstwish-web local branch `web-api-4` (head in your spawn line);
the first check's head was c7a70f9. Worktrees /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-wa4 (web) and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v2-wa4-api (API at 1056ded);
stack prefix v2wa4; ports 5480-5499; verify folder /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/web-api-4/round2/. Run every command with your own
worktree as the working directory.
 1. The driver: on ONE fresh stack, `npm run live:drive -- --allow-not-wired` twice back to back: every flow, 0 FAIL,
    exit 0 both times (the builder claims 560 of 560 twice). Read the flows' diff against c7a70f9: did any flow get
    green by checking LESS (a removed assertion, a wider "expected failure" list in flows/web-api-4.mjs:68-72, a
    skipped step)? Name each loosened line and whether the thing it no longer checks still works on the screen.
 2. The font fix: `precedence` was removed from five stylesheet links (components/engine/made/Scene.tsx:179,
    components/styles/scroll/shared/ScrollScene.tsx:308, components/app/studio/{Editor,Home,Start}.tsx). With the
    font host REACHABLE: each of those screens (a maker scene step, a scroll-style wish at /w/<slug>, Studio home,
    New, the editor) draws in the same fonts as on c7a70f9 (computed font-family of the heading and one body line,
    and document.fonts for the families), the link is in the document once (no duplicate per scene), and the
    cascade did not move (compare the computed colour, size and letter-spacing of five elements per screen with
    c7a70f9). With the host BLOCKED: 0 page errors on /app/new, /app, /, /w/<slug>.
 3. WishCard: a picture url that fails once draws on the retry; one that fails twice shows the mark; no request loop.
 4. Ban sends an Idempotency-Key (one ban on a double tap); the Audit "Who" filter lists current and removed staff.
 5. lib/api.ts after the merge: a caller's headers cannot overwrite Authorization or Idempotency-Key (test:client).
Checks: typecheck, gates, test:client (quiet logs, EXIT lines). Hand back ONCE in at most 12 lines: verdict (merge /
fix first), findings by severity with file:line, what was not run. Remove your worktrees, stack and databases; leave
no background jobs.
