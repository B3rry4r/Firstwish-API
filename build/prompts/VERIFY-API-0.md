VERIFIER API-0 | TIER T1 lean (with a few T2 attacks, because every money and identity module will stand on this) | Budget 60 steps.
You did not build this. Test the claims; do not trust them. You fix nothing.
Read /home/user/Firstwish-API/build/common-rules.md, .pipeline/conventions.md, build/prompts/SCAFFOLD.md (the cases are the contract).
Under test: local branch `api-0` (head b11e91e) of /home/user/Firstwish-API; base claude/sleepy-mayer-f0hkb8. Your own worktree
/tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/wt/v-api-0 (detached at api-0; `npm ci` there, quiet log); ports 4020-4029; database prefix vapi0; remove both when done; kill by PID.
PostgreSQL and Redis are already up locally (role firstwish). Never call a real provider.
CLAIMS (each: PASS or FAIL with the command and what you saw):
 1. `npm run build`, `npm run lint`, typecheck, `npm test` (76 tests), `scripts/gates.sh` each end EXIT 0 on Node 22.
 2. `scripts/stack.sh up vapi0 4020` and a second `up vapi0b 4021` run together; both GET /v1/health -> 200 {status, db, redis, version};
    `down` stops only its own PIDs and drops only its own database.
 3. Unknown route -> 404 in {error:{code,message,requestId}} with the same id in x-request-id; bad body -> 422 with fields (nested and
    unknown fields named); malformed JSON -> 400; a thrown error -> 500 with no stack or detail.
 4. Boot with DATABASE_URL missing exits 1 naming it; PROVIDERS=standin is refused when NODE_ENV=production.
 5. Money refuses 1500.5, "1500.50", "1,500"; allocate never loses a kobo. Normalisers: 08031472093 -> +2348031472093;
    " ADA@Example.com" -> ada@example.com; "@Ada_Obi" -> ada_obi; a +01:00 time -> UTC Z; " 2026-11-05 " -> 2026-11-05.
 6. Guards: no decorator -> 401 without a token; wrong role -> 403; a Paystack webhook needs a valid HMAC-SHA512 signature; an internal
    route answers 403 when x-forwarded-for is set. With the database down, health -> 503 {db:"down"}.
 7. R2 and Spaces are one S3-style adapter differing only by config; signed upload links are made with no network call.
Attacks: the handle rule against conventions.md exactly (3-20, starts and ends with a letter or number, no two dots or underscores
together, reserved words refused): try "a.", "ab", "a..b", "admin", 21 characters; a webhook with a valid signature over a DIFFERENT
body, and with the signature compared in non-constant time (read the code: timing-safe compare?); an internal route reached with a
spoofed or absent x-forwarded-for from outside (is "no header" the only proof of being internal? say what protects it in production);
the default-deny claim: add nothing, just list every route and its guard; x-request-id supplied by the client: echoed, and safe (length,
characters)?; an error envelope never leaks a Prisma or stack message (force a unique-violation style error if a table exists, else read
the filter); the gates: plant `parseFloat(amount)` and "out of scope" in a scratch file under src in YOUR worktree, gates must exit 1,
then remove it; CI file: does it run migrate before tests and fail on a red gate?; secrets: no real key or the owner's email anywhere;
env schema equals .pipeline/env-manifest.json names (list differences); money as float anywhere in src (grep Number( / parseFloat / toFixed).
Write /tmp/claude-0/-home-user/533566a9-6497-503f-863f-065ac253d739/scratchpad/build/verify/api-0/VERDICT.md (40 lines or fewer). Hand back in 20 lines or fewer: verdict merge or fix; findings by severity
(blocker, high, medium, low), one line each with file:line; what you did not run and why.
