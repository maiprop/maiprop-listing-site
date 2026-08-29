#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

if [ "$#" -eq 0 ] || [ -z "${RUNNER_TEMP:-}" ] || [ -z "${GITHUB_ENV:-}" ]; then
  echo "::error::Canonical database URL wrapper inputs are incomplete."
  exit 1
fi

database_env="$(mktemp "$RUNNER_TEMP/catalogue-hotfix-canonical-database.XXXXXX.env")"
chmod 600 "$database_env"
trap 'rm -f -- "$database_env"' EXIT

real_github_env="$GITHUB_ENV"
GITHUB_ENV="$database_env" node scripts/catalogue-hotfix-workflow-helpers.mjs normalize-db-url-env

canonical_db_url=""
canonical_db_url_count=0
while IFS='=' read -r name value; do
  if [ "$name" != "TARGET_DB_URL" ]; then
    echo "::error::Canonical database environment contains an unexpected name."
    exit 1
  fi
  canonical_db_url="$value"
  canonical_db_url_count="$((canonical_db_url_count + 1))"
done < "$database_env"

if [ "$canonical_db_url_count" -ne 1 ] || [ -z "$canonical_db_url" ]; then
  echo "::error::Canonical database environment is incomplete or ambiguous."
  exit 1
fi

export TARGET_DB_URL="$canonical_db_url"
: > "$database_env"
export GITHUB_ENV="$database_env"

"$@"
command_status="$?"
export GITHUB_ENV="$real_github_env"
exit "$command_status"
