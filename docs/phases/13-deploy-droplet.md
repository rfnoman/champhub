# Phase 13 — Production: DigitalOcean droplet + managed Postgres + Vercel (option B)

**Goal:** ChampHub live for a pilot of ~1,000 registered users.

| Host | Serves | Runs on |
|---|---|---|
| `champhub.fit` (+ `www`) | Player + admin app (`frontend/`) | Vercel project `champhub-web` |
| `turf.champhub.fit` | Owner app (`owner-frontend/`) | Vercel project `champhub-owner` |
| `api.champhub.fit` | Django API, `/admin/`, webhooks | DigitalOcean droplet, `blr1` |
| (private) | Postgres 17 + PostGIS | DigitalOcean **Managed PostgreSQL**, `blr1` |
| `clerk.champhub.fit`, `accounts.champhub.fit` | Clerk production instance | Clerk |

DNS for `champhub.fit` lives in **Cloudflare**.

**This changes DECISIONS D71.** D71 picked App Platform with managed Postgres and managed
Redis. The user chose **option B**: a plain droplet for the app processes and Redis, and
**managed Postgres** for the data. The database is the one thing the pilot cannot afford
to lose (bookings, payments, identity checks), so its backups, point-in-time restore and
upgrades go to DigitalOcean. Redis stays on the droplet. Losing it loses pending timers,
not records, and it runs with AOF. Moving it to managed Redis later is a one-variable
change (`REDIS_URL`). Record this as **D99** (step 10). What D71 got right still holds:
region `blr1`, frontends on Vercel, one backend image for three processes, S3-compatible
media.

```
 browser ──▶ Cloudflare DNS
              ├─ champhub.fit, turf.champhub.fit ──(DNS only)──▶ Vercel (2 projects)
              ├─ clerk./accounts.champhub.fit ───(DNS only)──▶ Clerk
              └─ api.champhub.fit ─────────────(proxied)────▶ Droplet blr1, 2 vCPU / 2 GB
                                                              ┌───────────────────────────┐
                                                              │ caddy :443 (CF origin cert)│
                                                              │  └▶ api  127.0.0.1:8000    │
                                                              │ worker (celery)            │
                                                              │ beat   (exactly one)       │
                                                              │ redis 8 (AOF)              │
                                                              └─────────────┬─────────────┘
                                                                VPC (private)│ TLS
                                                              ┌─────────────▼─────────────┐
                                                              │ Managed PostgreSQL 17      │
                                                              │ 1 GB, PostGIS, btree_gist  │
                                                              │ PgBouncer pool (txn mode)  │
                                                              │ daily backups + 7-day PITR │
                                                              └───────────────────────────┘
                                         photos ─▶ DO Spaces blr1 + CDN
                                         weekly verified dump ─▶ Spaces (private bucket)
```

---

## Who does what

Some steps need an account, a credit card, or a dashboard click. **Claude cannot create
accounts, accept terms, pay, or type secrets into dashboards.** Each step is tagged:

- **[USER]**: the user does it and pastes back the non-secret result (an IP, an ID).
- **[CLAUDE]**: Claude Code does it in the repo or over SSH.

Secrets (keys, passwords) never go into chat or git. The user puts them into
`/opt/champhub/.env.prod` on the droplet, into GitHub Actions secrets, or into Vercel's
env UI. Claude writes `deploy/.env.prod.example` with every name and no values.

---

## Step 0: Code fixes that block production [CLAUDE]

These came up while writing this plan. Fix them on a branch before deploying.

> **Done on branch `phase-13-deploy`.** What landed, where it differs from the list
> below:
> - Mail: `SMTP_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_USE_TLS` / `_USE_SSL` /
>   `_TIMEOUT` go into `MAILERS` OPTIONS. Importing settings fails if the SMTP backend
>   is chosen without `SMTP_HOST`.
> - Database: `POSTGRES_SSLMODE` (default `prefer`), `POSTGRES_SSLROOTCERT`, and
>   `POSTGRES_BEHIND_PGBOUNCER` (turns off server-side cursors), next to the existing
>   `POSTGRES_POOL` and `POSTGRES_CONN_MAX_AGE`.
> - Client IP: prod sets DRF `NUM_PROXIES` from `DRF_NUM_PROXIES` (default 1). The
>   Caddy half, which overwrites X-Forwarded-For with CF-Connecting-IP, is step 4's
>   `deploy/Caddyfile`. Until that file exists, the setting trusts whatever Cloudflare
>   appended last, which is still the real client.
> - Extensions: no change needed. Django's `CreateExtension` skips an extension that
>   already exists, so pre-creating them as `doadmin` makes `0001_extensions` a no-op.
> - Workers: the Dockerfile sets `ENV WEB_CONCURRENCY=3`, which gunicorn reads as its
>   default `--workers`. Override it with `WEB_CONCURRENCY`, not `GUNICORN_WORKERS`.
> - `.do/app.yaml`: a header comment now says it is not the live deployment and what to
>   change before applying it.
> - Tests: `apps/core/tests/test_production_settings.py`.

1. **Email has no SMTP config.** `MAILERS["default"]["OPTIONS"]` in
   `config/settings/base.py` is `{}`, so setting `DJANGO_EMAIL_BACKEND` to the SMTP
   backend sends nothing. Read `EMAIL_HOST`-style values from env *into `OPTIONS`*
   (`host`, `port`, `username`, `password`, `use_tls`) and keep the deprecated `EMAIL_*`
   **settings** out (D18). Provider: Resend or Brevo free tier over SMTP. Clerk sends its
   own sign-in emails, so this only affects Django's notification emails.
2. **The real client IP behind Cloudflare.** Every request reaches Django from Caddy,
   and Caddy sees Cloudflare's IPs. Check how DRF throttling finds the client
   (`NUM_PROXIES` / `REMOTE_ADDR`). Make Caddy set `X-Forwarded-For` from
   `CF-Connecting-IP` (trusted only from Cloudflare ranges) and set DRF `NUM_PROXIES`
   to match. Without this, every anonymous user in Bangladesh shares one
   `THROTTLE_ANON` bucket. Add a test.
3. **`btree_gist` and `postgis` extensions.** On managed Postgres they are created once
   by hand as `doadmin` (step 5), as `docs/DEPLOYMENT.md` §1 already says. Check whether
   any migration also tries `CreateExtension`. If so, it must be a no-op when the
   extension already exists (`IF NOT EXISTS`), because the app user is not a superuser.
3a. **TLS to the database.** Managed Postgres refuses connections without TLS.
   `config/settings/prod.py` **replaces** `DATABASES["default"]["OPTIONS"]` with
   `{"pool": …}`, so there is nowhere to set it today. Add
   `"sslmode": env("POSTGRES_SSLMODE", default="require")` (and `sslrootcert` from env,
   pointing at DO's CA cert, if `verify-full` is wanted) to the dict that prod builds.
   Keep dev and test unaffected.
3b. **Behind PgBouncer.** The 1 GB managed cluster allows about 22 connections. Three
   gunicorn workers, two Celery workers and beat, each with its own psycopg pool, will
   use them up. The app connects through DigitalOcean's connection pool in
   **transaction** mode, so in prod:
   - `POSTGRES_POOL=false` (PgBouncer is the pool; two pools on top of each other is just
     extra connections)
   - `POSTGRES_CONN_MAX_AGE=0`
   - `DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True` from an env flag
     (`POSTGRES_BEHIND_PGBOUNCER`). `.iterator()` cursors break in transaction mode.
   - **`migrate` and `backup_database` connect directly** (port 25060, not the pool port
     25061). DDL and `pg_dump` don't belong behind a transaction-mode pooler. Give
     `deploy.sh` a `POSTGRES_PORT` override for those two commands.
   Add tests that prod settings read these flags.
4. **`.do/app.yaml` passes `DATABASE_URL`, but settings only read `POSTGRES_*`.** It is
   not used by this phase. Leave a comment in the file, or delete it if D99 retires App
   Platform.
5. **Gunicorn worker count via env.** `backend/Dockerfile` hardcodes `--workers 3`. Make
   it `${GUNICORN_WORKERS:-3}` (shell-form CMD or an entrypoint) so the 2 GB fallback
   droplet can run 2.

Run `uv run pytest`, `ruff`, and both frontends' `lint && typecheck`. All must be green.

---

## Step 1: Accounts and the machine [USER]

1. **DigitalOcean.** Create a Droplet:
   - Region **Bangalore (blr1)**, image **Ubuntu 24.04 LTS x64**
   - **Basic, Regular SSD, 2 vCPU / 2 GB / 60 GB** ($18/mo). Without Postgres on the
     box, 2 GB plus 2 GB swap fits gunicorn ×3, Celery ×2, beat, Redis and Caddy.
   - **Weekly backups** are optional (+$3.60/mo). The box holds no data except the Redis
     queue, and step 3–5 rebuilds it. Turn them on if you'd rather restore than rebuild.
   - Put it in the default **VPC** for `blr1`.
   - Auth: **SSH key only** (add your Mac's `~/.ssh/id_ed25519.pub`)
   - Hostname `champhub-prod-1`
   - Then **Networking → Reserved IP**, and assign it to the droplet (free while assigned).
     SSLCommerz whitelists this IP (step 9), so it must not change.
2. **Managed PostgreSQL.** Databases → Create → **PostgreSQL 17**, `blr1`, same VPC,
   **Basic, 1 vCPU / 1 GB / 10 GB** ($15/mo), **no standby node** (add one later for
   automatic failover, +$15). Then:
   - **Users & Databases:** create database `champhub` and user `champhub`. The app
     never uses `doadmin`.
   - **Connection Pools:** create pool `champhub-pool`, database `champhub`, user
     `champhub`, mode **Transaction**, size **18** (leave a few connections for
     `doadmin`, migrations and backups).
   - **Settings → Trusted sources:** add **only the droplet**. Nothing else can reach it,
     including your laptop. Add your IP temporarily if you ever need `psql` from home.
   - Download the **CA certificate**. Give Claude the **private (VPC) hostnames** for
     the direct and pool connections. The passwords go in `.env.prod` on the droplet.
3. **Spaces.** Create two Spaces in `blr1` ($5/mo covers both, 250 GB):
   - `champhub-media`, CDN **on** (photos + `private/` identity docs, with per-object ACLs)
   - `champhub-backups`, CDN **off**, private
   - Create one Spaces access key.
   - Use Spaces, **not** Cloudflare R2. R2 does not support per-object ACLs, so a
     public R2 bucket would expose the `private/` identity-document prefix (D89).
     Moving to R2 needs a separate private bucket in settings first.
4. **Vercel.** You need a **Pro** plan ($20/mo, 1 seat). Hobby is non-commercial only.
5. **Clerk.** Create a **production** instance with domain `champhub.fit`. Clerk will show
   ~5 DNS records. Keep that page open for step 2.
6. **Email (Resend or Brevo).** Add the domain `champhub.fit` and get SMTP credentials.
7. Give Claude: the **reserved IP**, the database private hostnames, and confirm SSH works: `ssh root@<ip>`.

---

## Step 2: Cloudflare DNS [USER, with Claude listing the exact records]

Claude prints the exact record table for the user to paste in. Rules:

| Name | Type | Target | Proxy |
|---|---|---|---|
| `api` | A | droplet reserved IP | **Proxied** (orange) |
| `@` | A / CNAME | value Vercel shows for `champhub.fit` | **DNS only** (grey) |
| `www` | CNAME | value Vercel shows | **DNS only** |
| `turf` | CNAME | value Vercel shows | **DNS only** |
| Clerk records (`clerk`, `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey`) | CNAME | as Clerk shows | **DNS only**. Clerk fails verification if proxied |
| Email provider SPF/DKIM/DMARC | TXT/CNAME | as provider shows | DNS only |

Cloudflare settings:
- **SSL/TLS → Full (strict).** Vercel records are DNS-only, so this only affects `api`.
- **SSL/TLS → Origin Server → Create certificate** for `api.champhub.fit` (15 years).
  The user saves cert + key to the droplet at `/opt/champhub/certs/` (step 4).
- Leave "Rocket Loader" and HTML minification **off**. They break nothing on a JSON
  API but are noise.
- The SSE notification stream sends a keepalive every 25 s
  (`notifications/stream.py:HEARTBEAT_SECONDS`), which is under Cloudflare's 100 s idle
  timeout. Keep it below 100 s.

---

## Step 3: Harden the droplet [CLAUDE over SSH]

```
apt update && apt full-upgrade -y
adduser --disabled-password deploy && usermod -aG sudo,docker deploy   # after docker install
# copy root's authorized_keys to deploy; then in sshd_config:
#   PermitRootLogin no, PasswordAuthentication no
apt install -y docker.io docker-compose-v2 ufw fail2ban unattended-upgrades
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
# + /etc/fstab entry, vm.swappiness=10
timedatectl set-timezone UTC
```

Firewall: use a **DigitalOcean Cloud Firewall** (free, applied before traffic reaches
the box):
- 22/tcp from the user's IP only (or anywhere, key-only plus fail2ban, if their IP changes)
- 80, 443/tcp from **Cloudflare IP ranges only** (cloudflare.com/ips)
- Everything else denied. Redis is **never** published to the host.
- The managed database has its own firewall (trusted sources = this droplet only, step
  1.2) and is reached over the VPC private hostname, never the public one.

Docker bypasses `ufw` for published ports, so the compose file binds `api` to
`127.0.0.1` only and Caddy is the only container with public ports.

---

## Step 4: Compose for one machine [CLAUDE in repo]

Create `deploy/` (keep `docker-compose.prod.yml` as the generic topology, or replace it.
Pick one and say so in D99):

- `deploy/compose.yml`: services `caddy`, `api`, `worker`, `beat`, `redis`.
  **No `postgres`** (managed) and **no `web` or `owner`** (Vercel). Nothing has a
  `depends_on: postgres`. The API healthcheck already reports the database, so a
  database outage shows up there.
  - `redis`: `--appendonly yes --maxmemory 256mb --maxmemory-policy noeviction`.
    It is the Celery broker, so it must never evict.
  - `api`: `ports: ["127.0.0.1:8000:8000"]`, `WEB_CONCURRENCY=3`, healthcheck on
    `/api/v1/health`.
  - `worker`: `--concurrency=2` (raise later). `beat`: exactly one.
  - `caddy`: `caddy:2-alpine`, ports 80/443, mounts `Caddyfile` and `/opt/champhub/certs`.
  - Every service: `restart: unless-stopped`, log rotation
    (`logging: {driver: json-file, options: {max-size: 10m, max-file: "5"}}`).
    Without rotation the disk fills in a few months.
  - `POSTGRES_HOST=<private pool host>`, `POSTGRES_PORT=25061`,
    `REDIS_URL=redis://redis:6379/0`. Mount DO's CA cert read-only if using `verify-full`.
- `deploy/Caddyfile`:
  ```
  api.champhub.fit {
      tls /certs/origin.pem /certs/origin.key
      encode gzip
      reverse_proxy api:8000 {
          flush_interval -1          # SSE
          header_up X-Forwarded-Proto https
      }
  }
  ```
  plus the Cloudflare trusted-proxy / `CF-Connecting-IP` handling from step 0.2.
- `deploy/.env.prod.example`: every variable, no values (see "Environment" below).
- `deploy/backup.sh`: DigitalOcean already takes daily backups with 7-day point-in-time
  restore. This script is the **second, off-provider copy** that D68 asks for, so a
  deleted cluster or a mistake older than 7 days can still be undone. It runs
  `manage.py backup_database` (dump plus verified restore) inside `api` against the
  **direct** port 25060, uploads to `champhub-backups` with `aws s3 cp --endpoint-url
  https://blr1.digitaloceanspaces.com`, and keeps 8 weekly dumps. Systemd timer, Sundays
  03:00 Dhaka (Saturday 21:00 UTC). Check where `backup_database` restores its scratch
  copy: the `champhub` user needs `CREATEDB` on the cluster (grant it as `doadmin`), or
  point the scratch restore at a throwaway Postgres container on the droplet.
- `deploy/deploy.sh` (run on the droplet):
  `git pull --ff-only && docker compose build api && POSTGRES_HOST=<direct host>
  POSTGRES_PORT=25060 docker compose run --rm api python manage.py migrate --noinput &&
  docker compose up -d && curl -fsS https://api.champhub.fit/api/v1/health`. Migrations run
  **before** new code serves, and go direct rather than through PgBouncer (step 0.3b).

Build the image **on the droplet** for now. With 2 GB plus swap the build works but is
slow (several minutes), and the running API stays up while it builds. If builds start
hurting the live site, build in GitHub Actions and push to GHCR instead.

---

## Step 5: First boot [USER + CLAUDE]

1. [CLAUDE] On the droplet as `deploy`: generate a **read-only GitHub deploy key**,
   print the public half. [USER] adds it to the repo (Settings → Deploy keys).
2. [CLAUDE] `git clone` to `/opt/champhub`.
3. [USER] Fills `/opt/champhub/deploy/.env.prod` from the example, pasting the
   `champhub` database password from the DO dashboard. Claude can generate
   `DJANGO_SECRET_KEY` and the VAPID keys **on the droplet** straight into the file, so
   they never pass through chat. Puts the Cloudflare origin cert in
   `/opt/champhub/certs/`. `chmod 600` both.
4. [USER, with Claude giving the commands] Enable the extensions once, as `doadmin`, from
   the droplet (`docker run --rm -it postgres:17 psql "<doadmin direct URI>"`):
   ```sql
   \c champhub
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   GRANT ALL ON SCHEMA public TO champhub;
   ALTER DATABASE champhub OWNER TO champhub;
   ```
   Without `btree_gist`, the bookings migration fails (D29). Without the schema grant,
   Postgres 15+ refuses `CREATE TABLE` from the app user.
5. [CLAUDE] `deploy/deploy.sh`, then check:
   - `curl https://api.champhub.fit/api/v1/health` returns 200 and reports DB, cache and workers
   - `docker compose ps` all healthy, `docker compose logs beat` shows the schedule
   - The DO dashboard's pool view shows connections well under 18 during a test click-through
6. [CLAUDE] Seed the sport catalogue only (whatever `seed_demo` splits out for
   reference data). **Never run demo users/turfs in production.**

---

## Step 6: Vercel projects [USER, Claude lists values]

Two projects from the same GitHub repo:

| | `champhub-web` | `champhub-owner` |
|---|---|---|
| Root directory | `frontend` | `owner-frontend` |
| Domain | `champhub.fit`, `www.champhub.fit` (redirect to apex) | `turf.champhub.fit` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | same |
| `CLERK_SECRET_KEY` | `sk_live_…` | same |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.champhub.fit` | same |
| `NEXT_PUBLIC_SITE_URL` | `https://champhub.fit` | `https://turf.champhub.fit` |
| `NEXT_PUBLIC_OWNER_APP_URL` | `https://turf.champhub.fit` | — |
| `NEXT_PUBLIC_PLAYER_APP_URL` | — | `https://champhub.fit` |
| `NEXT_PUBLIC_SENTRY_*` | optional | optional |

- Both apps use the **same Clerk instance**. The two hosts share the registrable domain
  `champhub.fit`, so one sign-in covers both (D85).
- There is deliberately **no `NEXT_PUBLIC_CLERK_SIGN_IN_URL`** row (or the three beside
  it). This table not having them is what broke sign-in on the first deploy: they were
  in `.env.local.example` only, so local development had them and production did not,
  and an empty Clerk URL is not an error — Clerk falls back to the Dashboard. Signed-out
  visitors were sent to the hosted account portal on `accounts.champhub.fit` in Clerk's
  default purple, and anyone who did sign in landed on the marketing page. They are in
  `src/lib/clerk-routes.ts` in each app now, read by both `app/layout.tsx` and
  `src/proxy.ts`, and a unit test checks each one names a route that exists. Do not add
  them back here.
- `NEXT_PUBLIC_*` is baked in at build time: change one, then **redeploy**.
- `vercel.json` pins `sin1`. The API is in Bangalore, so consider `bom1` (Mumbai) for
  server-side fetches. Measure both before changing.
- Turn on "Ignored Build Step" per project (`git diff --quiet HEAD^ HEAD -- .`) so a
  backend-only commit does not rebuild both frontends.

---

## Step 7: Backend environment (`deploy/.env.prod`)

```
DJANGO_SETTINGS_MODULE=config.settings.prod
DJANGO_SECRET_KEY=                      # generated on the box
DJANGO_ALLOWED_HOSTS=api.champhub.fit
POSTGRES_DB=champhub
POSTGRES_USER=champhub
POSTGRES_PASSWORD=                      # from the DO dashboard (user champhub)
POSTGRES_HOST=private-champhub-db-do-user-….db.ondigitalocean.com   # VPC host
POSTGRES_PORT=25061                     # the PgBouncer pool; migrate/backup use 25060
POSTGRES_DIRECT_PORT=25060
POSTGRES_SSLMODE=require
POSTGRES_POOL=false                     # PgBouncer is the pool (step 0.3b)
POSTGRES_CONN_MAX_AGE=0
POSTGRES_BEHIND_PGBOUNCER=true
REDIS_URL=redis://redis:6379/0
CORS_ALLOWED_ORIGINS=https://champhub.fit,https://www.champhub.fit,https://turf.champhub.fit
CLERK_AUTHORIZED_PARTIES=https://champhub.fit,https://www.champhub.fit,https://turf.champhub.fit
CLERK_FRONTEND_API_URL=https://clerk.champhub.fit
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
API_PUBLIC_BASE_URL=https://api.champhub.fit
PAYMENT_RETURN_BASE_URL=https://champhub.fit
OWNER_APP_BASE_URL=https://turf.champhub.fit
AWS_STORAGE_BUCKET_NAME=champhub-media
AWS_S3_ENDPOINT_URL=https://blr1.digitaloceanspaces.com
AWS_S3_REGION_NAME=blr1
AWS_S3_CUSTOM_DOMAIN=champhub-media.blr1.cdn.digitaloceanspaces.com
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL=ChampHub <no-reply@champhub.fit>
SMTP_HOST=smtp.resend.com              # or smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_USE_TLS=true
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CONTACT_EMAIL=
SSLCOMMERZ_STORE_ID=
SSLCOMMERZ_STORE_PASSWORD=
SSLCOMMERZ_SANDBOX=true                 # false only after step 9 passes
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
ADMIN_REQUIRES_OTP=true
API_DOCS_PUBLIC=false
WEB_CONCURRENCY=3                       # gunicorn workers; 2 on a 2 GB box if memory is tight
DRF_NUM_PROXIES=1                       # Caddy is the one trusted hop
```

Forgetting an origin in `CLERK_AUTHORIZED_PARTIES` gives a 401 on every call from that
app and nothing in the log but "Unauthorized" (D85). That includes `www`.

---

## Step 8: Wire the third parties [USER, Claude verifies]

- **Clerk webhook** → `https://api.champhub.fit/api/v1/webhooks/clerk`, events
  `user.*`. Copy the signing secret into `.env.prod`, then `docker compose up -d api`.
  Without it, sign-ups never reach Django.
- **Clerk → Paths/Domains:** allowed redirect origins include both Vercel hosts.
- **SSLCommerz IPN** → `https://api.champhub.fit/api/v1/payments/ipn/sslcommerz`.
- **SSLCommerz:** register the droplet's **reserved IP** for the refund API.
- **Sentry** (optional): two frontend DSNs plus the backend DSN.
- **Uptime:** a free UptimeRobot / Better Stack check on `/api/v1/health` and both
  frontends, alerting to the user's email.

---

## Step 9: Launch checks [CLAUDE + USER]

Run against production with `SSLCOMMERZ_SANDBOX=true` first:

1. Sign up on `champhub.fit`. The Django user exists (webhook worked), and onboarding works.
2. Open `turf.champhub.fit`. You are already signed in (shared session).
3. Owner creates a turf with a photo. The photo URL is on the Spaces CDN.
4. Upload an identity document. Fetching `…/private/…` directly from Spaces gives **403**.
5. Platform admin (DEPLOYMENT.md §8), then register TOTP and log in to
   `api.champhub.fit/admin/`.
6. Approve the turf, book a slot as a player, confirm the hold expires via Celery (beat
   + worker alive).
7. Sandbox payment end to end, IPN received.
8. Notification bell updates live (SSE through Cloudflare + Caddy).
9. `deploy/backup.sh` by hand. The dump is in `champhub-backups`, and the restore check passed.
10. **Practise a managed restore once:** in the DO dashboard, fork the cluster to a point
    in time 10 minutes ago, then confirm the fork has your test booking. Delete the
    fork afterwards (it is billed while it exists). Better to learn the clicks now than
    during an incident.
11. Reboot the droplet. Everything comes back by itself, with no data lost.

Then flip `SSLCOMMERZ_SANDBOX=false` with live credentials and repeat step 7 with a
small real payment the user makes.

---

## Step 10: CI deploys and docs [CLAUDE]

- Rewrite `.github/workflows/deploy.yml`: keep the `gate` job, replace the doctl job with
  an SSH job (`appleboy/ssh-action`, pinned to a version) that runs
  `/opt/champhub/deploy/deploy.sh` as `deploy`, then the existing health-check loop.
  Re-arm `push: branches: [main]` **only after step 9 passes**.
  GitHub secrets: `DROPLET_HOST`, `DROPLET_SSH_KEY` (a dedicated CI key whose
  `authorized_keys` entry is restricted with `command="/opt/champhub/deploy/deploy.sh"`).
- Rewrite `docs/DEPLOYMENT.md` for this topology (keep the App Platform version as a
  short "scaling up" appendix).
- Add **D99** to `docs/DECISIONS.md`: one droplet for the app processes and Redis, plus
  managed Postgres behind PgBouncer, for the pilot (option B, chosen by the user over
  everything-on-one-droplet, droplet + managed Redis too, and App Platform). Include the
  why and the scaling steps below.
- Delete `.do/app.yaml` or fix its `DATABASE_URL` → `POSTGRES_*` mismatch (step 0.4),
  depending on whether D99 keeps App Platform as the scaling path.
- Update `docs/PROGRESS.md` and `docs/PLAN.md`.

---

## Scaling steps (write into D99)

Do them in this order, and only when the signal shows up:

| Signal | Step | Extra cost |
|---|---|---|
| Droplet swapping, or API CPU over 70% sustained | Resize droplet to 2 vCPU / 4 GB (about a 1 min power cycle, no data on it) | +$6 |
| DB CPU or memory over 80% in DO metrics, or pool waits | Resize the cluster to 2 GB. Online, a few seconds' blip | +$15 |
| Any database downtime is unacceptable (real revenue) | Add a standby node for automatic failover | +$15 |
| Lost Redis timers start to hurt | Managed Redis/Valkey, change `REDIS_URL` | +$15 |
| One droplet is not enough, or you want zero-downtime deploys | App Platform (`.do/app.yaml`), keeping the same database | ≈ +$15–25 |

Rough guide: option B as specced is comfortable up to a few thousand monthly active
users and around 50 people using the site at the same moment.

---

## Cost (USD/month, list prices as of late 2026, so check before buying)

Option B, chosen by the user:

| Item | Cost |
|---|---|
| Droplet blr1, 2 vCPU / 2 GB | $18 |
| Droplet backups (optional, weekly) | $3.60 |
| Managed PostgreSQL 17, 1 GB, daily backups + 7-day PITR included | $15 |
| Spaces (media + off-provider dumps, 250 GB, CDN) | $5 |
| Vercel Pro (1 seat, both projects) | $20 |
| Clerk, Cloudflare DNS, email, Sentry, uptime (free tiers) | $0 |
| **Total** | **≈ $62 / month** (≈ $58 without droplet backups) |

For comparison: everything on one droplet ≈ $54; B + managed Redis ≈ $77; App Platform +
managed Postgres and Redis ≈ $84.

Domain renewal is extra (yearly, from Cloudflare Registrar). SSLCommerz charges per
transaction (a % of each payment), not a monthly fee.
