#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

if [ "$#" -eq 0 ] || [ -z "${RUNNER_TEMP:-}" ] || [ -z "${GITHUB_ENV:-}" ]; then
  echo "::error::Database phase wrapper inputs are incomplete."
  exit 1
fi

database_env="$(mktemp "$RUNNER_TEMP/catalogue-hotfix-database-phase.XXXXXX.env")"
chmod 600 "$database_env"
trap 'rm -f -- "$database_env"' EXIT

real_github_env="$GITHUB_ENV"
GITHUB_ENV="$database_env" node scripts/catalogue-hotfix-workflow-helpers.mjs normalize-db-url-env
normalized_db_url=""
while IFS='=' read -r name value; do
  if [ "$name" != "TARGET_DB_URL" ] || [ -n "$normalized_db_url" ]; then
    echo "::error::Normalized database environment is incomplete or ambiguous."
    exit 1
  fi
  normalized_db_url="$value"
done < "$database_env"
if [ -z "$normalized_db_url" ]; then
  echo "::error::Normalized database environment is incomplete or ambiguous."
  exit 1
fi
export TARGET_DB_URL="$normalized_db_url"
: > "$database_env"
GITHUB_ENV="$database_env" bash scripts/catalogue-hotfix-database-login.sh
unset SUPABASE_ACCESS_TOKEN

target_db_url=""
target_db_ephemeral_role=""
target_db_url_count=0
target_db_ephemeral_role_count=0
while IFS='=' read -r name value; do
  case "$name" in
    TARGET_DB_URL)
      target_db_url="$value"
      target_db_url_count="$((target_db_url_count + 1))"
      ;;
    TARGET_DB_EPHEMERAL_ROLE)
      target_db_ephemeral_role="$value"
      target_db_ephemeral_role_count="$((target_db_ephemeral_role_count + 1))"
      ;;
    *)
      echo "::error::Temporary database environment contains an unexpected name."
      exit 1
      ;;
  esac
done < "$database_env"

if [ "$target_db_url_count" -ne 1 ] || [ "$target_db_ephemeral_role_count" -ne 1 ] ||
   [ -z "$target_db_url" ] || [ -z "$target_db_ephemeral_role" ]; then
  echo "::error::Temporary database environment is incomplete or ambiguous."
  exit 1
fi

export TARGET_DB_URL="$target_db_url"
export TARGET_DB_EPHEMERAL_ROLE="$target_db_ephemeral_role"
export GITHUB_ENV="$database_env"
node scripts/catalogue-hotfix-workflow-helpers.mjs validate-target

"$@"
phase_status="$?"
export GITHUB_ENV="$real_github_env"
exit "$phase_status"
