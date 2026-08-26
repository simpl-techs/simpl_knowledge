#!/usr/bin/env bash
# Set one secret on every Doppler project that uses it (prd + dev + stg).
# The value is read from stdin or a hidden prompt and is never printed.
#
# Usage:
#   scripts/doppler/set-secret.sh RESEND_API_KEY
#   printf '%s' "$VALUE" | scripts/doppler/set-secret.sh RESEND_API_KEY
#
# Targets live in scripts/doppler/key-targets.txt (KEY<space>project...).
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MAP="$ROOT/key-targets.txt"
CONFIGS=(prd dev stg)

if [[ $# -ne 1 ]]; then
  echo "usage: $0 KEY_NAME" >&2
  exit 2
fi

KEY="$1"
line="$(awk -v key="$KEY" '$1 == key { $1=""; sub(/^ /,""); print; exit }' "$MAP")"
if [[ -z "$line" ]]; then
  echo "unknown key $KEY — add it to $MAP" >&2
  exit 1
fi

read -r -a PROJECTS <<<"$line"
if [[ -t 0 ]]; then
  read -r -s -p "value for ${KEY} (hidden): " VALUE
  echo
else
  VALUE="$(cat)"
fi
if [[ -z "$VALUE" ]]; then
  echo "empty value, abort" >&2
  exit 1
fi

for project in "${PROJECTS[@]}"; do
  for config in "${CONFIGS[@]}"; do
    names="$(doppler secrets -p "$project" -c "$config" --only-names --json --no-read-env 2>/dev/null || true)"
    if [[ -z "$names" ]]; then
      echo "skip ${project}/${config} (config missing)"
      continue
    fi
    printf '%s' "$VALUE" | doppler secrets set "$KEY" -p "$project" -c "$config" --silent
    echo "set ${KEY} on ${project}/${config}"
  done
done
