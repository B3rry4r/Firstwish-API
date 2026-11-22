# Running the API from an empty database

These are the commands that were run, in this order, against an EMPTY PostgreSQL database and a clean checkout (Node 22,
PostgreSQL 16, Redis). Names of environment variables only; values come from the host's secret store. `scripts/smoke-env.mjs`
(after a build) prints, for every variable, whether the server refuses to start in production without it.

## 1. Install and build

    npm ci                  # also runs `prisma generate` (postinstall)
    npm run build           # tsc -p tsconfig.build.json, writes dist/

Environment: none.

## 2. Migrate from zero

    npm run migrate         # prisma migrate deploy: applies prisma/migrations in order; never `db push`

Environment: `DATABASE_URL`. Run it a second time and it answers "No pending migrations to apply." (exit 0). Run it before
every start of a new version, never from two hosts at once.

## 3. Seed the reference rows

    npm run seed            # node scripts/seed.mjs

Environment: `DATABASE_URL`. Reference rows only (price book, staff roles, lifecycle terms, payout threshold, the style and
catalogue rows, the house account); never people or wishes. A second run changes nothing and prints the same line
("seed: reference rows in place"): every row is upserted on a fixed id, and a figure staff changed is never put back.

## 4. Start the server

    npm start               # node dist/main.js; listens on PORT (default 3000)

Environment the server refuses to start without (it names each bad one and exits 1):

- always: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `AUTH_CODE_PEPPER`, `INTERNAL_TOKEN`
  (each secret 32 characters or more), `COOKIE_DOMAIN`, `WEB_ORIGINS`, `PUBLIC_SITE_URL`, `API_PUBLIC_URL`.
- with live providers (`PROVIDERS` unset or `live`, which is the only mode `NODE_ENV=production` accepts): `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `PAYSTACK_SECRET_KEY` (20 characters or more), `PAYSTACK_PUBLIC_KEY`,
  `PAYSTACK_CALLBACK_URL`, `STORAGE_DRIVER` (`r2` or `spaces`), `SCREENING_PROVIDER` (`basic`), `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL`, `RESEND_API_KEY`, `MAIL_FROM`.
- with `STORAGE_DRIVER=r2`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
  With `STORAGE_DRIVER=spaces`: `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET`.
- optional: `PORT`, `NODE_ENV`, `TRUST_PROXY_HOPS` (1 behind one load balancer), `JSON_BODY_LIMIT_BYTES`, `PORT_TIMEOUTS_MS`,
  `STAFF_BOOTSTRAP_OWNER_EMAIL`, `RESEND_WEBHOOK_SECRET`, `SCREENING_API_KEY`, `RENDER_CONCURRENCY`.
- never in production (refused): `PROVIDERS=standin`, `STANDIN_MAIL_OUTBOX`, `STANDIN_CLOCK_OFFSET`, `STANDIN_SCREENING`.

## 5. Check it answers

With `BASE=http://<host>:<PORT>/v1`:

    curl -s $BASE/health                  # 200 {"status":"ok","db":"ok","redis":"ok","version":...}
    curl -s $BASE/price-book              # 200 {"items":[...]} (version 1, prices in kobo)
    curl -s $BASE/styles                  # 200 {"items":[...]} (the public styles list)
    curl -s -X POST $BASE/auth/codes -H 'content-type: application/json' -d '{"contact":"someone@example.com"}'
                                          # 200 {"sent":true,"resendAfter":60,"destination":"s***@example.com"}
    curl -s -X POST $BASE/auth/codes/verify -H 'content-type: application/json' -d '{"contact":"someone@example.com","code":"<the six digits from the email>"}'
                                          # 200 {"accessToken":...,"isNew":true,"session":{...}} and the refresh cookie
    curl -s $BASE/me -H "authorization: Bearer <accessToken>"       # 200 the account; without the header: 401 unauthorized

The same code asked again for the same address within 60 seconds is not sent again (`resendAfter`).

## A local stack on the stand-ins (no real provider)

    scripts/stack.sh up <prefix> <port>   # own database <prefix>_test, API on <port>, stand-in providers; prints BASE_URL and the PID
    scripts/stack.sh down <prefix>        # stops that PID and drops its databases

Environment: `PG_ADMIN_URL` (a role that can create databases; default a local `firstwish` role), `REDIS_PORT` (default 6379),
`STACKS_DIR`, `STACK_SKIP_BUILD`, `STACK_WEB_ORIGINS` (all optional). The stack sets the rest itself with made-up secrets, and
`PROVIDERS=standin`. To read the sign-in code without a mailbox, start the server with `STANDIN_MAIL_OUTBOX=<a file>`: each
message is appended there as one JSON line (stand-in only).

## Tests and checks

    npm test                                  # every spec, one fresh database per run (TEST_DB_PREFIX names the databases)
    node scripts/smoke-alone.mjs              # every spec by itself on its own fresh database; one PASS/FAIL/TIMEOUT line each
    node scripts/smoke-coverage.mjs           # the registry endpoints no spec calls
    node scripts/smoke-env.mjs                # the env manifest against the code and a production start (needs a build)
    npm run gates; npm run contracts:check; node scripts/check-drift.mjs; node scripts/check-routes.mjs

Environment: `DATABASE_URL` is set by the runners themselves; `PG_ADMIN_URL`, `REDIS_URL`, `TEST_DB_PREFIX`, `SMOKE_LOG_DIR` optional.
