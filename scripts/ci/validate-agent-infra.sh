#!/usr/bin/env bash
# Validate hooks.json schema, plugin/marketplace version alignment, and version bumps
# when plugins/<name>/ changes in a PR.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

CURSOR_EVENTS=(
  sessionStart sessionEnd preToolUse postToolUse postToolUseFailure
  subagentStart subagentStop beforeShellExecution afterShellExecution
  beforeMCPExecution afterMCPExecution beforeReadFile afterFileEdit
  beforeSubmitPrompt preCompact stop afterAgentResponse afterAgentThought
  beforeTabFileRead afterTabFileEdit workspaceOpen
)

CLAUDE_EVENTS=(
  SessionStart Stop PreToolUse PostToolUse UserPromptSubmit Notification
  SubagentStart SubagentStop PreCompact PermissionRequest
)

python3 - <<'PY'
import json, os, subprocess, sys
from pathlib import Path

root = Path(os.environ.get("GITHUB_WORKSPACE") or Path.cwd())
if not (root / ".claude-plugin" / "marketplace.json").exists():
    # When invoked as scripts/ci/validate-agent-infra.sh from repo root:
    root = Path.cwd()

CURSOR_EVENTS = set("""
sessionStart sessionEnd preToolUse postToolUse postToolUseFailure
subagentStart subagentStop beforeShellExecution afterShellExecution
beforeMCPExecution afterMCPExecution beforeReadFile afterFileEdit
beforeSubmitPrompt preCompact stop afterAgentResponse afterAgentThought
beforeTabFileRead afterTabFileEdit workspaceOpen
""".split())

CLAUDE_EVENTS = set("""
SessionStart Stop PreToolUse PostToolUse UserPromptSubmit Notification
SubagentStart SubagentStop PreCompact PermissionRequest
""".split())

errors = []

def is_cursor_hooks(path: Path, data: dict) -> bool:
    # Cursor: top-level version + hooks with camelCase events, or $schema cursor
    if "$schema" in data and "cursor.com" in str(data.get("$schema", "")):
        return True
    if path.as_posix().endswith(".cursor/hooks.json") or "/.cursor/" in path.as_posix():
        return True
    # Global installer target is Cursor-only
    if path.name == "hooks.json" and "cursor" in path.as_posix():
        return True
    hooks = data.get("hooks")
    if isinstance(hooks, dict) and any(k in CURSOR_EVENTS for k in hooks):
        # Ambiguous if also Claude — prefer Claude when nested command.hooks present
        for v in hooks.values():
            if isinstance(v, list) and v and isinstance(v[0], dict) and "hooks" in v[0]:
                return False
        return True
    return False

def validate_cursor(path: Path, data: dict):
    if "hooks" not in data or not isinstance(data["hooks"], dict):
        errors.append(f"{path}: Cursor hooks.json must have a top-level 'hooks' object")
        return
    # Disallow event keys at top level
    for k in data:
        if k in CURSOR_EVENTS:
            errors.append(f"{path}: event '{k}' must be under hooks, not top-level")
    for event, entries in data["hooks"].items():
        if event.startswith("_"):
            continue
        if event not in CURSOR_EVENTS:
            errors.append(f"{path}: unknown Cursor event '{event}'")
        if not isinstance(entries, list):
            errors.append(f"{path}: hooks.{event} must be an array")
            continue
        for i, entry in enumerate(entries):
            if not isinstance(entry, dict) or "command" not in entry:
                errors.append(f"{path}: hooks.{event}[{i}] must be an object with 'command'")

def validate_claude(path: Path, data: dict):
    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        errors.append(f"{path}: Claude hooks.json must have a top-level 'hooks' object")
        return
    for event, entries in hooks.items():
        if event not in CLAUDE_EVENTS:
            errors.append(f"{path}: unknown Claude event '{event}'")
        if not isinstance(entries, list):
            errors.append(f"{path}: hooks.{event} must be an array")

# --- hooks.json files ---
for path in sorted(root.rglob("hooks.json")):
    if "node_modules" in path.parts:
        continue
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        errors.append(f"{path}: invalid JSON ({e})")
        continue
    if not isinstance(data, dict):
        errors.append(f"{path}: root must be an object")
        continue
    if is_cursor_hooks(path, data):
        validate_cursor(path, data)
    else:
        validate_claude(path, data)

# --- marketplace vs plugin.json versions ---
mp_path = root / ".claude-plugin" / "marketplace.json"
mp = json.loads(mp_path.read_text(encoding="utf-8"))
mp_versions = {p["name"]: p["version"] for p in mp.get("plugins", []) if "name" in p and "version" in p}

for plugin_json in sorted((root / "plugins").glob("*/.claude-plugin/plugin.json")):
    name = plugin_json.parent.parent.name
    pj = json.loads(plugin_json.read_text(encoding="utf-8"))
    pv = pj.get("version")
    if name not in mp_versions:
        errors.append(f"{plugin_json}: plugin '{name}' missing from marketplace.json")
        continue
    if str(pv) != str(mp_versions[name]):
        errors.append(
            f"{name}: plugin.json version {pv} != marketplace.json version {mp_versions[name]}"
        )

# --- PR version bump check ---
base = os.environ.get("VALIDATE_BASE_REF") or os.environ.get("GITHUB_BASE_REF")
if base:
    try:
        subprocess.check_call(
            ["git", "rev-parse", "--verify", f"origin/{base}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        diff_range = f"origin/{base}...HEAD"
    except Exception:
        diff_range = f"{base}...HEAD"
    try:
        changed = subprocess.check_output(
            ["git", "diff", "--name-only", diff_range],
            text=True,
        ).splitlines()
    except Exception as e:
        errors.append(f"could not compute git diff against {base}: {e}")
        changed = []

    touched_plugins = set()
    for f in changed:
        parts = Path(f).parts
        if len(parts) >= 2 and parts[0] == "plugins":
            touched_plugins.add(parts[1])

    for name in sorted(touched_plugins):
        plugin_json = root / "plugins" / name / ".claude-plugin" / "plugin.json"
        if not plugin_json.exists():
            continue
        try:
            old = subprocess.check_output(
                ["git", "show", f"{diff_range.split('...')[0]}:plugins/{name}/.claude-plugin/plugin.json"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
            old_ver = json.loads(old).get("version")
        except Exception:
            # New plugin — ok
            continue
        new_ver = json.loads(plugin_json.read_text(encoding="utf-8")).get("version")
        if str(old_ver) == str(new_ver):
            # Allow if the only changes under the plugin are non-content? Plan says any change under plugins/<p>/ requires bump.
            plugin_files = [f for f in changed if f.startswith(f"plugins/{name}/")]
            if plugin_files:
                errors.append(
                    f"{name}: files changed under plugins/{name}/ but version stayed {new_ver} — bump plugin.json and marketplace.json"
                )

if errors:
    print("validate-agent-infra FAILED:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)

print("validate-agent-infra OK")
PY
