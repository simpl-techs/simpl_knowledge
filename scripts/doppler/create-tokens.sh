#!/usr/bin/env bash
# Create read-only Doppler service tokens and write them to TOKEN_DIR.
# Tokens are never printed. Files are 0600.
#
# Usage:
#   scripts/doppler/create-tokens.sh
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_DIR="${TOKEN_DIR:-$HOME/.doppler/simpl-tokens}"
mkdir -p "$TOKEN_DIR"
chmod 700 "$TOKEN_DIR"

create_token() {
  local project="$1"
  local config="$2"
  local name="$3"
  local file="$4"
  if [[ -s "$file" ]]; then
    echo "exists $file"
    return 0
  fi
  doppler configs tokens create "$name" \
    --project "$project" \
    --config "$config" \
    --access read \
    --plain >"$file"
  chmod 600 "$file"
  echo "created $file"
}

while read -r project; do
  [[ -z "$project" || "$project" == \#* ]] && continue
  create_token "$project" dev "dev-readonly" "$TOKEN_DIR/${project}-dev"
done <"$ROOT/projects.txt"

while read -r project token_name; do
  [[ -z "$project" || "$project" == \#* ]] && continue
  create_token "$project" prd "$token_name" "$TOKEN_DIR/${project}-prd"
done <"$ROOT/prd-runtime.txt"

echo "tokens written under $TOKEN_DIR (not printed)"
ls -1 "$TOKEN_DIR"
