PATCH API-0 round 1 | TIER T1 | Budget 30 steps. Fix only the findings below; change nothing else.
Read /home/user/Firstwish-API/build/common-rules.md and /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-0/VERDICT.md.
Branch `api-0` (head b11e91e) of /home/user/Firstwish-API; worktree /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/p-api-0 (`npm ci`, quiet log); ports 4030-4039; database prefix papi0.
Findings to close:
 F1 (medium) src/common access.guard.ts:30: "internal" must not rest on the absence of a header. Default (lead), owner may override:
    an internal route is reachable only with a shared secret: header `x-internal-token` equal to env INTERNAL_TOKEN (compared with
    timingSafeEqual; at least 32 characters, boot fails naming it when missing or short; the stand-in env gives a test value), AND still
    refused when x-forwarded-for, forwarded or x-real-ip is present. Tests: no token 403; wrong token 403; right token with
    x-forwarded-for 403; right token alone 200. Add INTERNAL_TOKEN to the env schema, .env.example and README. (The lead adds it to
    .pipeline/env-manifest.json: say so in the hand-back.)
 F2 (low) scripts/stack.sh: `down <prefix>` also drops <prefix>_test_template.
 F3 (low) error-envelope.filter.ts:67: malformed JSON answers code `bad_json` (status 400), with a test; or remove the dead code and
    keep `bad_request`: pick the one conventions.md's error list names and say which.
Checks (quiet logs, EXIT lines): build, lint, typecheck, the affected specs (`npm run test:affected -- <paths>`), scripts/gates.sh.
Commit on `api-0` (do not push); remove your worktree and databases. Hand back in 8 lines: head sha; each finding closed or not with proof; EXIT lines.
