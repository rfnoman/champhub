#!/usr/bin/env bash
# Ship the current main to the droplet (Phase 13 step 4). Run on the droplet as `deploy`.
#
#   ssh deploy@api.champhub.fit /opt/champhub/deploy/deploy.sh
#
# Order matters: migrations run against the *new* code before any of it serves a
# request, and they go to the database directly rather than through the PgBouncer pool,
# because DDL in transaction mode is a bad idea (step 0.3b).
set -euo pipefail

REPO=${REPO:-/opt/champhub}
cd "$REPO"
COMPOSE=(docker compose -f deploy/compose.yml)
ENV_FILE="$REPO/deploy/.env.prod"

[[ -f $ENV_FILE ]] || { echo "deploy: $ENV_FILE is missing" >&2; exit 1; }

echo "--> fetching"
git fetch --prune origin
git merge --ff-only "origin/${BRANCH:-main}"

echo "--> building the backend image"
"${COMPOSE[@]}" build api

echo "--> migrating (direct connection, not the pool)"
# The pool is a different database *name* as well as a different port: PgBouncer is
# addressed as "champhub-pool", the real database is "champhub". Overriding only the
# port would ask the cluster directly for a database called champhub-pool, which does
# not exist.
DIRECT_PORT=$(grep -E '^POSTGRES_DIRECT_PORT=' "$ENV_FILE" | cut -d= -f2)
DIRECT_DB=$(grep -E '^POSTGRES_DIRECT_DB=' "$ENV_FILE" | cut -d= -f2)
"${COMPOSE[@]}" run --rm \
	-e "POSTGRES_PORT=${DIRECT_PORT:-25060}" \
	-e "POSTGRES_DB=${DIRECT_DB:-champhub}" \
	-e POSTGRES_BEHIND_PGBOUNCER=false \
	api python manage.py migrate --noinput

echo "--> starting"
# Sentry reports name the commit they came from.
SENTRY_RELEASE=$(git rev-parse --short HEAD) "${COMPOSE[@]}" up -d --remove-orphans

echo "--> waiting for the API to report healthy"
for _ in $(seq 1 30); do
	if curl -fsS --max-time 5 http://127.0.0.1:8000/api/v1/health >/dev/null; then
		echo "deploy: healthy at $(git rev-parse --short HEAD)"
		"${COMPOSE[@]}" ps
		exit 0
	fi
	sleep 5
done

echo "deploy: the API never reported healthy; last logs follow" >&2
"${COMPOSE[@]}" logs --tail 60 api >&2
exit 1
