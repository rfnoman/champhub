"""Production settings. Final hosting choices land in Phase 11 (DECISIONS D11)."""

from .base import *
from .base import DATABASES, LOGGING, MIDDLEWARE, REST_FRAMEWORK, STORAGES, env

DEBUG = False
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")

SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
# Except for the health endpoint, which is polled over plain HTTP on the loopback by the
# container healthcheck and by deploy.sh. Redirected, it answers 301 with an empty body
# — and `curl -f` treats a 301 as success, so the check would pass for a container that
# could not reach the database at all (Phase 13 step 5).
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health$"]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 365)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"
# A complete map of every endpoint, payload and parameter is the first thing anybody
# probing the API would want. The people who need it have accounts (Phase 11 step 4).
API_DOCS_PUBLIC = env.bool("API_DOCS_PUBLIC", default=False)
# Behind the admin password is every booking, payment and player record (D64).
ADMIN_REQUIRES_OTP = env.bool("ADMIN_REQUIRES_OTP", default=True)

# Who is asking, for the anonymous throttle. With `NUM_PROXIES` unset, DRF keys the
# throttle on the *whole* X-Forwarded-For header, which the client writes: a new
# made-up value per request is a new bucket per request, and the limit never applies.
# Production has exactly one hop we trust in front of gunicorn — Caddy, which
# overwrites X-Forwarded-For with Cloudflare's CF-Connecting-IP (deploy/Caddyfile) —
# so DRF takes the last address in the header and ignores anything a client prepended
# (Phase 13 step 0).
REST_FRAMEWORK = {**REST_FRAMEWORK, "NUM_PROXIES": env.int("DRF_NUM_PROXIES", default=1)}

# One JSON object per line: whatever collects these is a machine, not a person.
LOGGING["handlers"]["console"]["formatter"] = "json"

# WhiteNoise serves collected static files in production; in dev the staticfiles app does.
MIDDLEWARE = MIDDLEWARE.copy()
MIDDLEWARE.insert(
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

STORAGES = {
    **STORAGES,
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Connection pooling is psycopg3-only and wants Celery >= 5.6 for post-fork safety.
#
# Behind a server-side pooler (PgBouncer, as DigitalOcean's managed connection pools
# are) turn it off: the pooler *is* the pool, and a client pool in every gunicorn and
# Celery process on top of it only holds more of the cluster's few connections
# (Phase 13 step 0, DECISIONS D99).
_db_options: dict = {"pool": env.bool("POSTGRES_POOL", default=True)}

# Managed Postgres refuses unencrypted connections. `prefer` keeps a self-hosted
# database on a private network working, and `require` / `verify-full` are the managed
# settings; `verify-full` also needs the provider's CA certificate on disk.
_db_options["sslmode"] = env("POSTGRES_SSLMODE", default="prefer")
if _sslrootcert := env("POSTGRES_SSLROOTCERT", default=""):
    _db_options["sslrootcert"] = _sslrootcert

DATABASES["default"]["OPTIONS"] = _db_options
DATABASES["default"]["CONN_MAX_AGE"] = env.int("POSTGRES_CONN_MAX_AGE", default=60)

# In PgBouncer's transaction mode, consecutive queries can land on different server
# connections, so a server-side cursor declared by one is gone for the next and every
# `.iterator()` fails. Django's documented answer is to not declare them.
DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = env.bool(
    "POSTGRES_BEHIND_PGBOUNCER", default=False
)
