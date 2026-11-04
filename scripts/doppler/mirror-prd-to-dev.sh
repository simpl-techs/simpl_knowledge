#!/usr/bin/env bash
# Mirror each service project's prd config onto dev. Not copied: keys limited to
# prd in key-targets.txt (KEY@prd, e.g. the cost-tracking alert webhook) and the
# model keys in model-keys.txt, which dev keeps as its own keys (a dev config with
# no model key stays without one until a dev key is created).
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

# Keys whose key-targets.txt entry names configs without dev stay out of dev.
PRD_ONLY="$(awk '$1 ~ /@/ { split($1, part, "@"); if (part[2] !~ /(^|,)dev(,|$)/) print part[1] }' "$ROOT/key-targets.txt")"
# Model keys: dev uses its own key at the provider, never the prd one.
MODEL_KEYS="$(grep -v '^#' "$ROOT/model-keys.txt" | awk 'NF { print $1 }')"

while read -r project; do
  [[ -z "$project" || "$project" == \#* ]] && continue
  src="$WORKDIR/${project}-prd.env"
  doppler secrets download --project "$project" --config prd --no-file --format env >"$src"
  for key in $PRD_ONLY $MODEL_KEYS; do
    grep -v "^${key}=" "$src" >"$src.tmp" || true
    mv "$src.tmp" "$src"
  done
  # Belt and braces: whatever upload does to keys missing from the file, dev's own
  # model keys come back unchanged.
  kept=()
  for key in $MODEL_KEYS; do
    if has_secret "$project" dev "$key"; then
      doppler secrets get "$key" -p "$project" -c dev --plain >"$WORKDIR/${project}-${key}.dev"
      kept+=("$key")
    fi
  done
  doppler secrets upload --project "$project" --config dev "$src" >/dev/null
  for key in "${kept[@]+"${kept[@]}"}"; do
    printf '%s' "$(cat "$WORKDIR/${project}-${key}.dev")" | doppler secrets set "$key" -p "$project" -c dev --silent
  done
  echo "mirrored ${project}/prd -> ${project}/dev (model keys not copied; dev kept: ${kept[*]:-none})"
done <"$ROOT/projects.txt"
