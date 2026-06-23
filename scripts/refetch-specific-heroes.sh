#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${PEXELS_API_KEY:-}" && ! -f .env.local ]]; then
  echo "Missing PEXELS_API_KEY."
  echo "Either export it (no space after =):"
  echo "  export PEXELS_API_KEY=your_key"
  echo "Or create .env.local with:"
  echo "  PEXELS_API_KEY=your_key"
  exit 1
fi

node scripts/fetch-pexels-destination-heroes.mjs --force --specific
