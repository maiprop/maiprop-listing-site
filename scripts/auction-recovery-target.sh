#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
phase="${1:?auction phase required}"
node scripts/auction-recovery-control.mjs authorize
node scripts/auction-recovery-control.mjs verify "$AUCTION_ARTIFACT" auction-artifact-binding.json
node scripts/auction-recovery-release.mjs verify "$AUCTION_ARTIFACT" "$RELEASE_SHA" "$GITHUB_RUN_ID"
if [ "$TARGET_KIND" = production ]; then
  node scripts/auction-recovery-control.mjs verify auction-evidence/staging auction-staging-binding.json
  node scripts/auction-recovery-release.mjs staging-proof auction-evidence/staging "$RELEASE_SHA" "$GITHUB_RUN_ID"
fi
mkdir -p "auction-evidence/$TARGET_KIND"
case "$phase" in
  database)
    node scripts/auction-recovery-pages.mjs preflight
    bash scripts/catalogue-hotfix-with-database-login.sh bash scripts/auction-recovery-db.sh before
    bash scripts/catalogue-hotfix-linked-db-push.sh prepare
    work="$RUNNER_TEMP/catalogue-hotfix-$TARGET_KIND"
    node scripts/catalogue-hotfix-workflow-helpers.mjs validate-dry-run "$work/contract.json" "$work/remote-numeric-history.txt" "$work/dry-run-output.txt" "auction-evidence/$TARGET_KIND/dry-run.json"
    node scripts/auction-recovery-control.mjs authorize
    bash scripts/catalogue-hotfix-with-database-login.sh bash scripts/auction-recovery-db.sh recheck
    bash scripts/catalogue-hotfix-linked-db-push.sh apply
    bash scripts/catalogue-hotfix-with-database-login.sh bash scripts/auction-recovery-db.sh after
    ;;
  website)
    # Only the new website is rolled back. The additive auction DB repair stays compatible.
    rollback() { status="$?"; trap - ERR; node scripts/auction-recovery-pages.mjs rollback || echo '::error::Auction website rollback requires operator attention.'; exit "$status"; }
    trap rollback ERR
    node scripts/auction-recovery-pages.mjs deploy
    node scripts/auction-recovery-smoke.mjs
    trap - ERR
    ;;
  *) echo 'Unknown auction release phase.' >&2; exit 1 ;;
esac
