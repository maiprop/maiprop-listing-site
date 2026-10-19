#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
case "${1:-}" in
  prepare-db|apply) ;;
  *) echo 'Expected bounded advisor-index database phase.' >&2; exit 1 ;;
esac
if [ "$#" -ne 1 ]; then exit 1; fi
exec node scripts/advisor-index-release.mjs "$1"
