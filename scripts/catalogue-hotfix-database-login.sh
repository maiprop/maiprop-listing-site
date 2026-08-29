#!/usr/bin/env bash
set -euo pipefail
umask 077

case "${TARGET_KIND:-}:${TARGET_PROJECT_REF:-}" in
  staging:xsiehskfgeoqyazcgauv)
    endpoint="https://api.supabase.com/v1/projects/xsiehskfgeoqyazcgauv/cli/login-role"
    ;;
  production:qvvicunqcrwpioqnvzxf)
    endpoint="https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/cli/login-role"
    ;;
  *)
    echo "::error::Temporary database login target is not manifest-bound."
    exit 1
    ;;
esac

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] || [ -z "${TARGET_DB_URL:-}" ] || [ -z "${GITHUB_ENV:-}" ]; then
  echo "::error::Temporary database login inputs are incomplete."
  exit 1
fi

response_file="$(mktemp "$RUNNER_TEMP/catalogue-hotfix-database-login.XXXXXX.json")"
chmod 600 "$response_file"
trap 'rm -f -- "$response_file"' EXIT

status="000"
set +e
status="$(curl -s --request POST --connect-timeout 10 --max-time 30 --max-filesize 65536 --max-redirs 0 \
  -o "$response_file" -w '%{http_code}' \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  --data '{"read_only":false}' \
  "$endpoint")"
curl_status="$?"
set -e
if [ "$curl_status" -ne 0 ] || [ "$status" != "201" ]; then
  safe_status="invalid"
  if [[ "$status" =~ ^[0-9]{3}$ ]]; then safe_status="$status"; fi
  echo "::error::Temporary database login request failed with HTTP $safe_status."
  exit 1
fi

node scripts/catalogue-hotfix-workflow-helpers.mjs write-temporary-db-env "$response_file"
rm -f -- "$response_file"
trap - EXIT
