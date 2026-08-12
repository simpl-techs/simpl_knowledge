#!/usr/bin/env bash
# Install ~/.cursor/hooks/adapter.js + shared-hooks/, and merge sessionStart into
# ~/.cursor/hooks.json using Cursor's documented schema (events under hooks as arrays).
# Requires simpl_knowledge clone at ~/.claude/plugins/cache/<repo basename> (see callers).
#
# Usage (after sourcing):
#   install_cursor_global_hooks "simpl-techs/simpl_knowledge"

install_cursor_global_hooks() {
  local MARKETPLACE_REPO="${1:-simpl-techs/simpl_knowledge}"
  local CACHE="${HOME}/.claude/plugins/cache/${MARKETPLACE_REPO##*/}"
  local ADAPTER_SRC="${CACHE}/scripts/cursor-hooks/adapter.js"
  local SHARED_SRC="${CACHE}/scripts/shared-hooks"
  local CURSOR_HOOKS="${HOME}/.cursor/hooks"
  local HOOKS_JSON="${HOME}/.cursor/hooks.json"
  local BACKUP_DIR="${HOME}/.simpl_knowledge/backups"

  if [ ! -f "$ADAPTER_SRC" ]; then
    echo "  ⚠ install_cursor_global_hooks: missing ${ADAPTER_SRC} — clone ${MARKETPLACE_REPO} first." >&2
    return 0
  fi

  mkdir -p "$CURSOR_HOOKS" "$BACKUP_DIR"
  cp -f "$ADAPTER_SRC" "${CURSOR_HOOKS}/adapter.js"

  if [ -d "$SHARED_SRC" ]; then
    mkdir -p "${CURSOR_HOOKS}/shared-hooks"
    # Prefer rsync when available; fall back to cp -R for portability.
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete "${SHARED_SRC}/" "${CURSOR_HOOKS}/shared-hooks/"
    else
      rm -rf "${CURSOR_HOOKS}/shared-hooks"
      mkdir -p "${CURSOR_HOOKS}/shared-hooks"
      cp -R "${SHARED_SRC}/." "${CURSOR_HOOKS}/shared-hooks/"
    fi
  fi

  local WANT_CMD="node ${HOME}/.cursor/hooks/adapter.js session-refresh"
  python3 - "$HOOKS_JSON" "$WANT_CMD" "$BACKUP_DIR" <<'PY'
import json, pathlib, shutil, sys
from datetime import datetime, timezone

path = pathlib.Path(sys.argv[1])
want_cmd = sys.argv[2]
backup_dir = pathlib.Path(sys.argv[3])
want = {"command": want_cmd}

# Cursor agent events we may need to migrate from a broken top-level layout.
EVENT_KEYS = {
    "sessionStart",
    "sessionEnd",
    "preToolUse",
    "postToolUse",
    "postToolUseFailure",
    "subagentStart",
    "subagentStop",
    "beforeShellExecution",
    "afterShellExecution",
    "beforeMCPExecution",
    "afterMCPExecution",
    "beforeReadFile",
    "afterFileEdit",
    "beforeSubmitPrompt",
    "preCompact",
    "stop",
    "afterAgentResponse",
    "afterAgentThought",
    "beforeTabFileRead",
    "afterTabFileEdit",
    "workspaceOpen",
}


def as_hook_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [x for x in value if isinstance(x, dict) and "command" in x]
    if isinstance(value, dict) and "command" in value:
        return [value]
    return []


def dedupe_by_command(hooks):
    seen = set()
    out = []
    for h in hooks:
        cmd = h.get("command")
        if not isinstance(cmd, str) or cmd in seen:
            continue
        seen.add(cmd)
        out.append(h)
    return out


if path.exists():
    data = json.loads(path.read_text(encoding="utf-8"))
else:
    data = {}

if not isinstance(data, dict):
    data = {}

hooks = data.get("hooks")
if not isinstance(hooks, dict):
    hooks = {}

# Migrate legacy top-level event keys into hooks.*.
for key in list(data.keys()):
    if key in EVENT_KEYS:
        hooks[key] = dedupe_by_command(as_hook_list(hooks.get(key)) + as_hook_list(data.pop(key)))

session = dedupe_by_command(as_hook_list(hooks.get("sessionStart")))
if not any(h.get("command") == want_cmd for h in session):
    session.append(want)
hooks["sessionStart"] = session

new_data = {"version": int(data.get("version") or 1), "hooks": hooks}
# Preserve non-event top-level keys (e.g. user comments) except legacy events / version / hooks.
for k, v in data.items():
    if k in ("version", "hooks") or k in EVENT_KEYS:
        continue
    if k not in new_data:
        new_data[k] = v

if path.exists():
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        old = None
    if old == new_data:
        sys.exit(0)
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    shutil.copy2(path, backup_dir / f"hooks.json.{stamp}.bak")

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(new_data, indent=2) + "\n", encoding="utf-8")
PY
}
