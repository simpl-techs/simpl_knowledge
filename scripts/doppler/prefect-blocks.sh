#!/usr/bin/env bash
# Create Prefect Secret blocks that hold Doppler service tokens.
# Requires Prefect CLI authenticated to the workspace (Prefect 3.x).
# Mapping: scripts/doppler/prefect-blocks.txt
#
# Usage:
#   scripts/doppler/prefect-blocks.sh
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_DIR="${TOKEN_DIR:-$HOME/.doppler/simpl-tokens}"
MAP="$ROOT/prefect-blocks.txt"

if ! command -v prefect >/dev/null 2>&1; then
  echo "install Prefect CLI first, or: conda activate simpl_flow" >&2
  exit 1
fi

# Use the same interpreter as the Prefect CLI (conda env), not system python3.
PYTHON="$(dirname "$(command -v prefect)")/python"

"$PYTHON" - "$TOKEN_DIR" "$MAP" <<'PY'
from pathlib import Path
import sys

from prefect.blocks.system import Secret

token_dir = Path(sys.argv[1])
mapping = Path(sys.argv[2])
for raw in mapping.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    name, filename = line.split()
    path = token_dir / filename
    if not path.is_file():
        raise SystemExit(f"missing {path}")
    value = path.read_text().strip()
    if not value:
        raise SystemExit(f"empty {path}")
    Secret(value=value).save(name, overwrite=True)
    print(f"saved Prefect block secret/{name}")
PY

echo "Redeploy one flow first to validate doppler run, then the rest."
