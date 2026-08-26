#!/usr/bin/env bash
# Register a Doppler service token for the current repo directory.
# Local tokens are always config `dev` even when doppler.yaml pins `prd`.
#
# Usage:
#   DOPPLER_TOKEN=dp.st.dev.xxx scripts/doppler/setup-dev.sh
#   scripts/doppler/setup-dev.sh /path/to/token-file
set -euo pipefail

SCOPE="${PWD}"
if [[ -n "${1:-}" ]]; then
  TOKEN="$(tr -d '[:space:]' <"$1")"
elif [[ -n "${DOPPLER_TOKEN:-}" ]]; then
  TOKEN="$DOPPLER_TOKEN"
else
  echo "Pass a token file or set DOPPLER_TOKEN" >&2
  exit 1
fi

printf '%s' "$TOKEN" | doppler configure set token --scope "$SCOPE"
if [[ -f doppler.yaml ]]; then
  project="$(awk '/^[[:space:]]*project:/{print $2; exit}' doppler.yaml)"
  if [[ -n "$project" ]]; then
    doppler configure set "project=${project}" --scope "$SCOPE"
  fi
fi
doppler configure set config=dev --scope "$SCOPE"
echo "Doppler token scoped to ${SCOPE} (config=dev)"
echo "Run commands with: doppler run --config dev -- <your command>"
