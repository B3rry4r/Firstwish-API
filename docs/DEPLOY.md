# Putting Firstwish on a real server

Names of settings only. Values and secrets stay in the server's env file (`/etc/firstwish/api.env`, mode 0600), never in git or in a unit file.
The exact start-up rules are in `docs/RUN.md`; the full list of names is `.pipeline/env-manifest.json`.

## 1. The two services

| Service | Unit | Start command | Does |
|---|---|---|---|
| Web role | `deploy/systemd/firstwish-api.service` | `node dist/main.js` with `PROCESS_ROLE=web` | Answers every request and runs every job except a video render. |
| Render worker | `deploy/systemd/firstwish-render-worker.service` | `node dist/render-worker.js` (`npm run start:render-worker`) with `PROCESS_ROLE=render-worker` | Takes only video render jobs. Serves nothing but a health address. |

Both run the same build (`npm ci`, `npm run build`) from `/opt/firstwish/api` as user `firstwish`, and both read the same env file. Both units use
`Restart=always`. A render is never run inside the web process, so a render's memory cannot take the site down. (`PROCESS_ROLE=all` runs everything in
one process; use it only on a small test machine.)

## 2. Settings each service needs

### Both services (the server refuses to start in production without these)
- Database and queue: `DATABASE_URL`, `REDIS_URL`
- Secrets for sign-in and internal calls: `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `AUTH_CODE_PEPPER`, `INTERNAL_TOKEN`
- Addresses: `COOKIE_DOMAIN`, `WEB_ORIGINS`, `PUBLIC_SITE_URL`, `API_PUBLIC_URL`
- Sign-in with Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Payments: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_CALLBACK_URL`
- Writing and checking: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `SCREENING_PROVIDER`
- Email: `RESEND_API_KEY`, `MAIL_FROM`
- Storage: `STORAGE_DRIVER` (`r2` or `spaces`), then either `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  or `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET`
- Mode: `NODE_ENV` (production), `PROCESS_ROLE`

### Web role only, or set on both
- `PORT`, `TRUST_PROXY_HOPS` (set to 1 behind one load balancer; at 0 every caller looks like the balancer and one flood of wrong guesses at a public
  link would count against everyone, the render worker too), `JSON_BODY_LIMIT_BYTES`, `PORT_TIMEOUTS_MS`
- `STAFF_BOOTSTRAP_OWNER_EMAIL`, `RESEND_WEBHOOK_SECRET`, `SCREENING_API_KEY`
- `RENDER_WEB_ORIGIN` and `RENDER_TOKEN_SECRET` must be the same on both services, or the video is not sold (the top tickets stay unsold).

### Render worker only
- `RENDER_WORKER_ID`: one value per machine, different on every machine (never a copied hostname). A restarted worker frees the renders it held at
  once only when this is set.
- `RENDER_WORKER_PORT` (health port, 127.0.0.1 only), `RENDER_CONCURRENCY` (set 1), `RENDER_TIME_LIMIT_SECONDS`, `RENDER_TOKEN_TTL_SECONDS`
- `RENDER_CHROMIUM_PATH`, `RENDER_FFMPEG_PATH` (ffprobe is looked up beside ffmpeg)
- `RENDER_STORAGE_HOSTS`, `RENDER_ALLOWED_HOSTS` (the hosts the worker's browser may reach; the font hosts and the web and API addresses are
  allowed by default), `RENDER_CLOCK_PATH`, `RENDER_CLOCK_SHA256`, `RENDER_ADAPTER`

### Never set in production (the server refuses)
`PROVIDERS=standin`, `STANDIN_MAIL_OUTBOX`, `STANDIN_CLOCK_OFFSET`, `STANDIN_SCREENING`.

### The web site (Vercel), not this server
`API_ORIGIN` is read when the web is BUILT. Set it before the build and rebuild when the API address changes.

## 3. The machine

- Render worker: 4 GB memory, with swap (2 GB is enough: `fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile`, then a line in
  `/etc/fstab`). One render needs about 1.5 GB; keep `RENDER_CONCURRENCY=1`. The unit also caps the worker at 3 GB.
- Ubuntu packages: `ffmpeg` (brings `ffprobe`), `fonts-liberation`, `fonts-noto-color-emoji`, `fontconfig`, `ca-certificates`, `curl`, plus Node 22.
  `deploy/setup-ubuntu.sh` installs the packages and prints what is missing; it changes nothing else.
- Chromium: Ubuntu's own `chromium` package is a snap and does not suit a service. Install Google Chrome (default path `/usr/bin/google-chrome`) or the
  Playwright Chromium build, and set `RENDER_CHROMIUM_PATH` to the program. Needed on both machines only if both run the worker; the web role does not render.
- Fonts: the styles load their web fonts from Google Fonts at render time (the worker may reach `fonts.googleapis.com` and `fonts.gstatic.com`);
  the packages above are the fallback.
- PostgreSQL 16 and Redis reachable from both services.

## 4. Migrations

    cd /opt/firstwish/api && npm run migrate     # prisma migrate deploy; never db push
    npm run seed                                  # reference rows, only the first time (safe to repeat)

Run the migration before every start of a new version, from one host only, never from two at once.

## 5. Health addresses

- Web role: `GET http://<host>:<PORT>/v1/health` answers 200 with `db` and `redis` ok.
- Render worker: `GET http://127.0.0.1:<RENDER_WORKER_PORT>/health` (default port 9091; this machine only).
- The worker checks at boot that ffmpeg, ffprobe and Chromium run; a problem shows in its log and the video stays unsold.

## 6. Order to start

1. PostgreSQL and Redis.
2. `npm ci`, `npm run build`, `npm run migrate`, `npm run seed` (first time).
3. `systemctl enable --now firstwish-api` and check its health address.
4. `systemctl enable --now firstwish-render-worker` and check its health address.
5. Put the web (Vercel, built with `API_ORIGIN`) in front last.

Install: copy the two units to `/etc/systemd/system/`, `systemctl daemon-reload`.

## 7. Owner items

- The DigitalOcean server (size: see the question below) and its address; the bucket (R2 or Spaces) and its keys; the domain and the load balancer
  (and so `TRUST_PROXY_HOPS`).
- Every key and secret named in section 2, put into `/etc/firstwish/api.env` by the owner.
- OWNER QUESTION, not a decision: the slow 3D styles. Owambe (a WebGL style) costs about 1.3 s a frame on a CPU-only machine of the test size: a 60 s
  video is about 39 minutes, past `RENDER_TIME_LIMIT_SECONDS` (1200). The choices are a bigger server or one with a GPU, a longer limit for those styles,
  or a shorter status video for them. Measure on the real server first.
