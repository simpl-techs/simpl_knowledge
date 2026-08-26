#!/usr/bin/env bash
# Mirror each service project's prd config onto dev, preserving OPENAI_API_KEY on
# dev when a distinct key already exists there.
#
# Usage:
#   scripts/doppler/mirror-prd-to-dev.sh
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

has_secret() {
  local project="$1" config="$2" name="$3"
  doppler secrets -p "$project" -c "$config" --only-names --json \
    | python3 -c "import json,sys; raise SystemExit(0 if sys.argv[1] in json.load(sys.stdin) else 1)" "$name"
}

while read -r project; do
  [[ -z "$project" || "$project" == \#* ]] && continue
  src="$WORKDIR/${project}-prd.env"
  doppler secrets download --project "$project" --config prd --no-file --format env >"$src"
  saved_openai=""
  if has_secret "$project" prd OPENAI_API_KEY && has_secret "$project" dev OPENAI_API_KEY; then
    saved_openai="$WORKDIR/${project}-openai.dev"
    doppler secrets get OPENAI_API_KEY -p "$project" -c dev --plain >"$saved_openai"
  fi
  doppler secrets upload --project "$project" --config dev "$src" >/dev/null
  if [[ -n "$saved_openai" ]]; then
    doppler secrets set -p "$project" -c dev "OPENAI_API_KEY=$(cat "$saved_openai")" >/dev/null
    echo "mirrored ${project}/prd -> ${project}/dev (kept existing OPENAI_API_KEY)"
  else
    echo "mirrored ${project}/prd -> ${project}/dev"
  fi
done <"$ROOT/projects.txt"
