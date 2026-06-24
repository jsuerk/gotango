#!/usr/bin/env bash
# Fetch hero candidates from Pexels + Wikimedia for review (does not update manifest).
set -euo pipefail
cd "$(dirname "$0")/.."

ONLY="${1:-}"
ONLY_FLAG=()
if [[ -n "$ONLY" ]]; then
  ONLY_FLAG=(--only "$ONLY")
fi

if [[ -z "${PEXELS_API_KEY:-}" ]] && [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

echo "=== Pexels candidates ==="
node scripts/fetch-pexels-destination-heroes.mjs --candidates --specific "${ONLY_FLAG[@]}"

echo ""
echo "=== Wikimedia candidates ==="
node scripts/fetch-wikimedia-destination-heroes.mjs --candidates --specific "${ONLY_FLAG[@]}"

echo ""
echo "=== Review page ==="
node scripts/build-hero-review.mjs
echo "Open destination-hero-review.html in your browser."
