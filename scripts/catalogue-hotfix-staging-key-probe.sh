#!/usr/bin/env bash
set -euo pipefail

if [ "${TARGET_KIND:-}" != staging ]; then echo "Staging public API key probe kind is not exact." >&2; exit 1; fi
if [ "${TARGET_PROJECT_REF:-}" != xsiehskfgeoqyazcgauv ]; then echo "Staging public API key probe ref is not exact." >&2; exit 1; fi
if [ "$#" -ne 1 ]; then echo "Staging public API key probe input count is not exact." >&2; exit 1; fi

candidates_file="$1"
probe_url="https://${TARGET_PROJECT_REF}.supabase.co/auth/v1/settings"
probe_max_attempts=3

probe_candidate() {
  local candidate="$1" status="000" attempts=0
  while [ "$attempts" -lt "$probe_max_attempts" ]; do
    attempts="$((attempts + 1))"
    status="000"
    if ! status="$(curl -s --connect-timeout 10 --max-time 30 -o /dev/null -w '%{http_code}' "$probe_url" -H "Accept: application/json" -H "apikey: $candidate")"; then
      status="000"
    fi
    case "$status" in
      000|408|429|5??)
        if [ "$attempts" -lt "$probe_max_attempts" ]; then continue; fi
        ;;
    esac
    break
  done
  printf '%s %s\n' "$status" "$attempts"
}

publishable_key="$(jq -r '.publishable // empty' "$candidates_file")"
legacy_anon_key="$(jq -r '.legacy_anon // empty' "$candidates_file")"
publishable_status="not-probed"; publishable_attempts=0
legacy_anon_status="not-probed"; legacy_anon_attempts=0
if [ -n "$publishable_key" ]; then
  read -r publishable_status publishable_attempts < <(probe_candidate "$publishable_key")
  if [ "$publishable_status" = "401" ] && [ -n "$legacy_anon_key" ]; then
    read -r legacy_anon_status legacy_anon_attempts < <(probe_candidate "$legacy_anon_key")
  fi
elif [ -n "$legacy_anon_key" ]; then
  read -r legacy_anon_status legacy_anon_attempts < <(probe_candidate "$legacy_anon_key")
fi

node scripts/catalogue-hotfix-workflow-helpers.mjs select-live-staging-public-key-env \
  "$candidates_file" \
  "$publishable_status" "$publishable_attempts" \
  "$legacy_anon_status" "$legacy_anon_attempts"
