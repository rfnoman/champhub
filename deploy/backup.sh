#!/usr/bin/env bash
# The second, off-provider copy of the database (D68, Phase 13 step 4).
#
# DigitalOcean already takes daily backups of the managed cluster with 7-day
# point-in-time restore, and that covers "yesterday went wrong". It does not cover a
# deleted cluster, a closed account, or a mistake nobody noticed for a month — so this
# runs weekly, dumps to a bucket in a different service, and keeps two months of them.
#
# `manage.py backup_database` dumps *and* restores the dump into a scratch database
# before it reports success: an untested backup is a belief, not a safeguard.
#
# Timer: deploy/champhub-backup.timer, Sundays 03:00 Dhaka (Saturday 21:00 UTC).
set -euo pipefail

REPO=${REPO:-/opt/champhub}
ENV_FILE="$REPO/deploy/.env.prod"
BACKUP_DIR=${BACKUP_DIR:-$REPO/backups}
cd "$REPO"

[[ -f $ENV_FILE ]] || { echo "backup: $ENV_FILE is missing" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

BUCKET=${BACKUP_BUCKET:-champhub-backups}
KEEP=${BACKUP_KEEP:-8}
mkdir -p "$BACKUP_DIR"
# The container runs as uid 10001 and has to be able to write the dump.
chown -R 10001:10001 "$BACKUP_DIR" 2>/dev/null || true

echo "--> dumping and verifying"
# Direct connection, not the pool: pg_dump holds one session for the whole dump and
# declares cursors, neither of which belongs in PgBouncer's transaction mode.
# --maintenance-db=defaultdb because the scratch createdb/dropdb would otherwise
# connect to template1, which managed Postgres refuses to anyone but its superuser.
docker compose -f deploy/compose.yml run --rm \
	-e "POSTGRES_PORT=${POSTGRES_DIRECT_PORT:-25060}" \
	-e POSTGRES_BEHIND_PGBOUNCER=false \
	-v "$BACKUP_DIR:/backups" \
	api python manage.py backup_database \
	--output-dir /backups \
	--keep 2 \
	--maintenance-db defaultdb

DUMP=$(ls -t "$BACKUP_DIR"/*.dump | head -1)
echo "--> uploading $(basename "$DUMP") to s3://$BUCKET"

# The AWS CLI in a container rather than on the box: one less thing to keep patched,
# and the credentials stay in .env.prod.
s3() {
	docker run --rm \
		-e "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" \
		-e "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" \
		-e "AWS_DEFAULT_REGION=${AWS_S3_REGION_NAME:-blr1}" \
		-v "$BACKUP_DIR:/backups:ro" \
		amazon/aws-cli:latest \
		--endpoint-url "$AWS_S3_ENDPOINT_URL" "$@"
}

s3 s3 cp "/backups/$(basename "$DUMP")" "s3://$BUCKET/weekly/$(basename "$DUMP")"

echo "--> pruning to the last $KEEP weekly dumps"
# `s3 ls` sorts by key, and the key carries a sortable timestamp, so the oldest are
# whatever falls off the front of the list.
mapfile -t REMOTE < <(s3 s3 ls "s3://$BUCKET/weekly/" | awk '{print $4}' | sort)
COUNT=${#REMOTE[@]}
if (( COUNT > KEEP )); then
	for key in "${REMOTE[@]:0:$((COUNT - KEEP))}"; do
		echo "    deleting $key"
		s3 s3 rm "s3://$BUCKET/weekly/$key"
	done
fi

echo "backup: done, $COUNT dumps in the bucket before pruning"
