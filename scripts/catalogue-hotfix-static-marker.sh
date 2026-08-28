#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then echo "Database hotfix static marker input count is not exact." >&2; exit 1; fi
if [ -z "${RUNNER_TEMP:-}" ]; then echo "Database hotfix static marker temp directory is unavailable." >&2; exit 1; fi

expected_sha="$1"
evidence_path="$2"
marker_url="https://portal.maiprop.co/deploy-version.json"
umask 077
body_file="$(mktemp "$RUNNER_TEMP/catalogue-hotfix-static-marker.XXXXXX.json")"
chmod 600 "$body_file"
trap 'rm -f -- "$body_file"' EXIT

status="000"
if ! status="$(curl -s --connect-timeout 10 --max-time 30 --retry 2 --retry-connrefused --retry-delay 1 --retry-max-time 90 --max-redirs 0 -o "$body_file" -w '%{http_code}' -H "Accept: application/json" -H "Cache-Control: no-cache" "$marker_url")"; then
  status="000"
fi
if [ "$status" != "200" ]; then
  case "$status" in [0-9][0-9][0-9]) ;; *) status="invalid" ;; esac
  echo "Database hotfix static marker request failed with HTTP $status." >&2
  exit 1
fi

node scripts/catalogue-hotfix-workflow-helpers.mjs write-static-marker-evidence \
  "$expected_sha" "$body_file" "$evidence_path"
