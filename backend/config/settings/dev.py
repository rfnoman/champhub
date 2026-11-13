"""Local development settings."""

from .base import *
from .base import REST_FRAMEWORK, env

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Browsable API is handy while hand-testing endpoints locally.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

# Dev convenience only: never set this in production.
CORS_ALLOW_ALL_ORIGINS = env.bool("CORS_ALLOW_ALL_ORIGINS", default=False)

# Uploaded media is served by *this* server in development, but it is read by a browser
# pointed at Next.js on another port — so a root-relative `MEDIA_URL` resolves against
# `localhost:3000` and every uploaded photo renders as a broken image. Deployments with
# a bucket get absolute URLs from the storage backend; this is the local equivalent.
# `config/urls.py` serves the files at `/media/` regardless of what this says.
#
# The host has to match the origin in `NEXT_PUBLIC_API_BASE_URL` **exactly**, because
# both frontends name that origin in their `img-src` policy and CSP does not consider
# `localhost` and `127.0.0.1` the same place. Mismatch them and every uploaded photo is
# blocked silently — no broken-image error, no network entry, nothing in the console but
# a CSP violation nobody is looking at.
MEDIA_URL = env("MEDIA_URL", default="http://127.0.0.1:8000/media/")
