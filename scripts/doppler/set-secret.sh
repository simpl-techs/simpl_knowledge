#!/usr/bin/env bash
# Set one secret on every Doppler project that uses it (prd + dev + stg, or the
# configs named after @ in key-targets.txt, e.g. KEY@prd).
# The value is read from stdin or a hidden prompt and is never printed.
#
# Model keys (model-keys.txt) go on prd only. Their dev/stg value is a separate key
# created at the provider, written by naming the configs; a value equal to the
# project's prd key is refused there.
#
# Usage:
#   scripts/doppler/set-secret.sh RESEND_API_KEY
#   printf '%s' "$VALUE" | scripts/doppler/set-secret.sh RESEND_API_KEY
#   scripts/doppler/set-secret.sh DEEPSEEK_API_KEY dev,stg   # the dev key, not the prd one
#
# Targets live in scripts/doppler/key-targets.txt (KEY<space>project...).
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MAP="$ROOT/key-targets.txt"
CONFIGS=(prd dev stg)

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 KEY_NAME [configs, e.g. dev,stg]" >&2
  exit 2
fi

KEY="$1"
entry="$(awk -v key="$KEY" '{ name = $1; sub(/@.*/, "", name) } name == key { print; exit }' "$MAP")"
if [[ -z "$entry" ]]; then
  echo "unknown key $KEY — add it to $MAP" >&2
  exit 1
fi
first="${entry%%[[:space:]]*}"
line="${entry#"$first"}"
if [[ "$first" == *@* ]]; then
  IFS=',' read -r -a CONFIGS <<<"${first#*@}"
fi

is_model_key=0
if grep -v '^#' "$ROOT/model-keys.txt" | awk 'NF { print $1 }' | grep -qx "$KEY"; then
  is_model_key=1
  CONFIGS=(prd)
fi
if [[ $# -eq 2 ]]; then
  IFS=',' read -r -a CONFIGS <<<"$2"
fi
if [[ "$is_model_key" == 1 && $# -eq 1 ]]; then
  echo "${KEY} is a model key: writing prd only. dev/stg need their own key: $0 ${KEY} dev,stg" >&2
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
    if [[ "$is_model_key" == 1 && "$config" != prd ]]; then
      prd_value="$(doppler secrets get "$KEY" -p "$project" -c prd --plain 2>/dev/null || true)"
      if [[ -n "$prd_value" && "$prd_value" == "$VALUE" ]]; then
        echo "refused ${KEY} on ${project}/${config}: that is the prd key; create a dev key at the provider" >&2
        continue
      fi
    fi
    printf '%s' "$VALUE" | doppler secrets set "$KEY" -p "$project" -c "$config" --silent
    echo "set ${KEY} on ${project}/${config}"
  done
done
