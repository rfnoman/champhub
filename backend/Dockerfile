# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# One image, three processes (Phase 11 step 8).
#
# The web server, the Celery worker and beat all run the same code and the same
# dependencies — they differ only in their command. Three Dockerfiles would be three
# things to keep in step, and the day they drift is the day beat runs last week's
# business rules.
#
# GeoDjango loads GEOS and GDAL through ctypes, so those libraries have to be present in
# the final image, not just at build time (CLAUDE.md, DECISIONS D16).
#
# No BuildKit cache mounts: they are faster, but they make the file unbuildable on a
# Docker install without buildx, and an image nobody can build locally is one nobody
# checks before pushing. Layer ordering does most of the same work.
# ---------------------------------------------------------------------------

FROM python:3.14-slim-trixie AS builder

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Dependencies first and on their own layer: application code changes on every deploy,
# the lock file does not, so this layer survives almost all of them.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY . .
RUN uv sync --locked --no-dev


FROM python:3.14-slim-trixie AS runtime

# `libgdal` and `libgeos` are runtime dependencies here, not build ones: Django imports
# them through ctypes when it loads any model with a PointField, which is most of them.
#
# The client tools come from PGDG and not from Debian, which ships 17: `pg_dump` refuses
# to touch a server newer than itself, and the managed cluster runs 18 — so a Debian
# `postgresql-client` makes `manage.py backup_database` fail with "aborting because of
# server version mismatch" and nothing else notices (Phase 13 step 4).
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        libgdal36 \
        libgeos-c1t64 \
        libproj25 \
        ca-certificates \
        curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc]" \
        "https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install --no-install-recommends -y postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

# Never root. A process that is compromised should not also own the filesystem.
RUN useradd --create-home --uid 10001 turf
WORKDIR /app

COPY --from=builder --chown=turf:turf /app /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

# Static files are collected at build time so the image is self-contained and a restart
# cannot race a collectstatic. A dummy key and host are enough for this to run: it
# touches no database and no secret.
RUN DJANGO_SECRET_KEY=build-only \
    DJANGO_ALLOWED_HOSTS=localhost \
    DATABASE_URL=postgres://u:p@localhost/db \
    python manage.py collectstatic --noinput --clear

USER turf
EXPOSE 8000

# Gunicorn's own default for `--workers` is $WEB_CONCURRENCY, so the count is set here
# and overridden per machine by the environment (a 2 GB droplet runs 2), without a
# shell-form CMD or an entrypoint script (Phase 13 step 0).
ENV WEB_CONCURRENCY=3

# Uvicorn workers, not sync ones: the Phase 09 notification stream is a long-lived
# response, and a sync worker holding one is a worker serving nobody (DECISIONS D54).
CMD ["gunicorn", "config.asgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
