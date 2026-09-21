#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
mode="${1:?database mode required}"
artifact="${AUCTION_ARTIFACT:?artifact required}"
work="$RUNNER_TEMP/catalogue-hotfix-$TARGET_KIND"
evidence="$GITHUB_WORKSPACE/auction-evidence/$TARGET_KIND"
mkdir -p "$evidence"
node scripts/auction-recovery-release.mjs verify "$artifact" "$RELEASE_SHA" "$GITHUB_RUN_ID"
case "$TARGET_KIND:$TARGET_PROJECT_REF" in
  staging:xsiehskfgeoqyazcgauv)
    node scripts/assert-staging-mutation-target.mjs --project-ref "$TARGET_PROJECT_REF" --database-url "$TARGET_DB_URL" --acknowledgement "$STAGING_MUTATION_ACKNOWLEDGEMENT" ;;
  production:qvvicunqcrwpioqnvzxf) ;;
  *) echo 'Invalid auction database target.' >&2; exit 1 ;;
esac
query() { psql "$TARGET_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 -qAt --command 'SET ROLE postgres' --command "$1"; }
case "$mode" in
  before)
    query "$(node scripts/auction-recovery-release.mjs history-sql)" > "$evidence/history-before.json"
    query "$(node scripts/auction-recovery-release.mjs schema-sql)" > "$evidence/schema-before.txt"
    node scripts/auction-recovery-release.mjs prepare-db "$artifact" "$evidence/history-before.json" "$work"
    ;;
  recheck)
    query "$(node scripts/auction-recovery-release.mjs history-sql)" > "$work/history-recheck.json"
    cmp "$evidence/history-before.json" "$work/history-recheck.json"
    query "$(node scripts/auction-recovery-release.mjs schema-sql)" > "$work/schema-recheck.txt"
    cmp "$evidence/schema-before.txt" "$work/schema-recheck.txt"
    ;;
  after)
    query "$(node scripts/auction-recovery-release.mjs history-sql)" > "$evidence/history-after.json"
    node scripts/auction-recovery-release.mjs history-check "$evidence/history-before.json" "$evidence/history-after.json"
    query "$(node scripts/auction-recovery-release.mjs schema-sql)" > "$evidence/schema-after.txt"
    cmp "$evidence/schema-before.txt" "$evidence/schema-after.txt"
    capabilities="$(query "$(node scripts/auction-recovery-release.mjs capabilities-sql "$artifact")")"
    test "$capabilities" = t
    printf '{"capabilities":true,"unrelated_schema_unchanged":true,"history_preserved":true}\n' > "$evidence/database.json"
    ;;
  *) echo 'Unknown auction database phase.' >&2; exit 1 ;;
esac
