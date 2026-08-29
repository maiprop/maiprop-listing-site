#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

if [ "$#" -ne 1 ] || [ -z "${RUNNER_TEMP:-}" ] ||
   [ -z "${GITHUB_WORKSPACE:-}" ] || [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "::error::Linked database push inputs are incomplete."
  exit 1
fi

mode="$1"
management_token="$SUPABASE_ACCESS_TOKEN"
unset SUPABASE_ACCESS_TOKEN
case "${TARGET_KIND:-}:${TARGET_PROJECT_REF:-}" in
  staging:xsiehskfgeoqyazcgauv|production:qvvicunqcrwpioqnvzxf) ;;
  *)
    echo "::error::Linked database push target is invalid."
    exit 1
    ;;
esac

work="$RUNNER_TEMP/catalogue-hotfix-$TARGET_KIND"
cli="$GITHUB_WORKSPACE/node_modules/.bin/supabase"
case "$mode" in
  prepare)
    output="$work/dry-run-output.txt"
    mode_flag="--dry-run"
    ;;
  apply)
    output="$work/push-output.txt"
    mode_flag="--yes"
    ;;
  *)
    echo "::error::Linked database push mode is invalid."
    exit 1
    ;;
esac

if [ ! -x "$cli" ] || [ ! -f "$work/supabase/config.toml" ] ||
   [ ! -d "$work/supabase/migrations" ]; then
  echo "::error::Linked database push workspace is incomplete."
  exit 1
fi

temporary="$work/supabase/.temp"
project_ref_file="$temporary/project-ref"
pooler_url_file="$temporary/pooler-url"
link_output="$work/link-output.txt"
: > "$output"
chmod 600 "$output"
cleanup() {
  unset management_token
  if [ "$mode" = apply ] || [ "${completed:-false}" != true ]; then
    rm -rf -- "$temporary"
  fi
}
trap cleanup EXIT

if [ "$mode" = prepare ]; then
  rm -rf -- "$temporary"
  mkdir -p "$temporary"
  : > "$link_output"
  chmod 600 "$link_output"
  if ! SUPABASE_ACCESS_TOKEN="$management_token" "$cli" --workdir "$work" --yes link --project-ref "$TARGET_PROJECT_REF" > "$link_output" 2>&1; then
    echo "::error::Official project link failed before the migration dry-run."
    exit 1
  fi
fi

if [ ! -f "$project_ref_file" ] || [ ! -f "$pooler_url_file" ]; then
  echo "::error::Official linked project state is incomplete."
  exit 1
fi
chmod 600 "$project_ref_file" "$pooler_url_file"
node scripts/catalogue-hotfix-workflow-helpers.mjs validate-linked-state "$project_ref_file" "$pooler_url_file"

if ! SUPABASE_ACCESS_TOKEN="$management_token" "$cli" --workdir "$work" --yes db push --linked --include-all "$mode_flag" > "$output" 2>&1; then
  echo "::error::Official linked database push failed in ${mode} mode."
  exit 1
fi
completed=true
