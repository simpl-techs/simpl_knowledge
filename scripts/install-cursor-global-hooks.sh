#!/usr/bin/env bash
# Install ~/.cursor/hooks/adapter.js + merge sessionStart into ~/.cursor/hooks.json.
# Requires simpl-knowledge clone at ~/.claude/plugins/cache/simpl-knowledge (see callers).
#
# Usage (after sourcing):
#   install_cursor_global_hooks "simpl/simpl-knowledge"

install_cursor_global_hooks() {
  local MARKETPLACE_REPO="${1:-simpl/simpl-knowledge}"
  local CACHE="${HOME}/.claude/plugins/cache/simpl-knowledge"
  local ADAPTER_SRC="${CACHE}/scripts/cursor-hooks/adapter.js"
  local CURSOR_HOOKS="${HOME}/.cursor/hooks"
  local HOOKS_JSON="${HOME}/.cursor/hooks.json"

  if [ ! -f "$ADAPTER_SRC" ]; then
    echo "  ⚠ install_cursor_global_hooks: missing ${ADAPTER_SRC} — clone ${MARKETPLACE_REPO} first." >&2
    return 0
  fi

  mkdir -p "$CURSOR_HOOKS"
  cp -f "$ADAPTER_SRC" "${CURSOR_HOOKS}/adapter.js"

  local WANT_CMD="node ${HOME}/.cursor/hooks/adapter.js session-refresh"
  python3 - "$HOOKS_JSON" "$WANT_CMD" <<'PY'
import json, pathlib, shutil, sys

path = pathlib.Path(sys.argv[1])
want_cmd = sys.argv[2]
want = {"command": want_cmd}

if path.exists():
    data = json.loads(path.read_text(encoding="utf-8"))
else:
    data = {}

prev = data.get("sessionStart")
if prev == want:
    sys.exit(0)

if path.exists():
    shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))

data["sessionStart"] = want
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY
}
