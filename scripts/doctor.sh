#!/usr/bin/env bash
# Compare installed Cursor rules / Claude plugins against simpl_knowledge main.
# Usage: bash scripts/doctor.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${SIMPL_KNOWLEDGE_REPO:-simpl-techs/simpl_knowledge}"
CURSOR_TAG="cursor-rules-rolling"
MARKETPLACE_NAME="${SIMPL_MARKETPLACE_NAME:-simpl}"

ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ⚠ %s\n' "$*"; }
bad() { printf '  ✗ %s\n' "$*"; }
section() { printf '\n== %s ==\n' "$*"; }

short() { printf '%s' "$1" | cut -c1-12; }

section "Cursor hooks.json schema"
HOOKS_JSON="${HOME}/.cursor/hooks.json"
if [ ! -f "$HOOKS_JSON" ]; then
  bad "missing ${HOOKS_JSON} — run team-bootstrap.sh"
else
  python3 - "$HOOKS_JSON" <<'PY' && ok "sessionStart registered under hooks as array" || true
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text())
hooks = data.get("hooks") if isinstance(data, dict) else None
ss = hooks.get("sessionStart") if isinstance(hooks, dict) else None
ok = isinstance(ss, list) and any(
    isinstance(x, dict) and "session-refresh" in str(x.get("command", "")) for x in ss
)
# legacy broken layout
legacy = isinstance(data, dict) and "sessionStart" in data and "hooks" in data and not (
    isinstance(data.get("hooks"), dict) and "sessionStart" in data["hooks"]
)
if legacy or (isinstance(data, dict) and "sessionStart" in data and not isinstance(hooks, dict)):
    print("  ✗ sessionStart is outside hooks (Cursor ignores it) — re-run install_cursor_global_hooks")
    raise SystemExit(1)
if not ok:
    print("  ✗ hooks.sessionStart missing session-refresh command")
    raise SystemExit(1)
PY
fi

section "Cursor shared-hooks"
SHARED="${HOME}/.cursor/hooks/shared-hooks"
if [ -f "${SHARED}/session-refresh.js" ]; then
  ok "found ${SHARED}/session-refresh.js"
else
  CACHE_SHARED="${HOME}/.claude/plugins/cache/simpl_knowledge/scripts/shared-hooks/session-refresh.js"
  if [ -f "$CACHE_SHARED" ]; then
    warn "global ~/.cursor/hooks/shared-hooks missing; adapter may still find cache copy"
  else
    bad "no shared-hooks on disk — adapter will no-op"
  fi
fi

section "Cursor rules vs release"
RULES_DIR="${HOME}/.cursor/rules"
if [ ! -d "$RULES_DIR" ]; then
  bad "missing ${RULES_DIR}"
else
  LOCAL_COUNT=$(find "$RULES_DIR" -name 'simpl-*.mdc' | wc -l | tr -d ' ')
  ok "${LOCAL_COUNT} simpl-*.mdc in ~/.cursor/rules"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ZIP_URL="https://github.com/${REPO}/releases/download/${CURSOR_TAG}/cursor-rules.zip"
if curl -fsSL -L "$ZIP_URL" -o "$TMP/cursor-rules.zip" 2>/dev/null; then
  unzip -o -q "$TMP/cursor-rules.zip" -d "$TMP/extract"
  SRC="$TMP/extract"
  [ -d "$TMP/extract/cursor-rules" ] && SRC="$TMP/extract/cursor-rules"
  if [ -f "$SRC/.version" ]; then
    ok "release .version: $(tr -d '\n' < "$SRC/.version")"
  else
    warn "release zip has no .version stamp yet"
  fi
  if [ -d "$RULES_DIR" ]; then
    DIFF=0
    for f in "$SRC"/simpl-*.mdc; do
      [ -f "$f" ] || continue
      base=$(basename "$f")
      if [ ! -f "${RULES_DIR}/${base}" ]; then
        bad "missing local rule ${base}"
        DIFF=1
      elif ! cmp -s "$f" "${RULES_DIR}/${base}"; then
        bad "stale local rule ${base}"
        DIFF=1
      fi
    done
    if [ "$DIFF" -eq 0 ]; then
      ok "local simpl-*.mdc match release zip"
    fi
  fi
else
  warn "could not download ${ZIP_URL}"
fi

section "simpl_knowledge cache"
CACHE="${SIMPL_KNOWLEDGE_CACHE:-${HOME}/.claude/plugins/cache/simpl_knowledge}"
if [ -d "${CACHE}/.git" ]; then
  LOCAL_SHA=$(git -C "$CACHE" rev-parse HEAD 2>/dev/null || echo unknown)
  git -C "$CACHE" fetch --quiet origin main 2>/dev/null || true
  REMOTE_SHA=$(git -C "$CACHE" rev-parse origin/main 2>/dev/null || echo unknown)
  ok "cache HEAD $(short "$LOCAL_SHA")"
  if [ "$LOCAL_SHA" != "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "unknown" ]; then
    bad "cache behind origin/main $(short "$REMOTE_SHA") — session-refresh should reset, or: git -C \"$CACHE\" reset --hard origin/main"
  else
    ok "cache matches origin/main"
  fi
else
  bad "missing cache git repo at ${CACHE}"
fi

section "Claude marketplace clone"
CLONE="${HOME}/.claude/plugins/marketplaces/${MARKETPLACE_NAME}"
if [ -d "${CLONE}/.git" ]; then
  LOCAL_SHA=$(git -C "$CLONE" rev-parse HEAD 2>/dev/null || echo unknown)
  git -C "$CLONE" fetch --quiet origin main 2>/dev/null || true
  REMOTE_SHA=$(git -C "$CLONE" rev-parse origin/main 2>/dev/null || echo unknown)
  AHEAD=$(git -C "$CLONE" rev-list --count "origin/main..HEAD" 2>/dev/null || echo 0)
  ok "marketplace HEAD $(short "$LOCAL_SHA")"
  if [ "${AHEAD}" != "0" ]; then
    bad "marketplace clone diverged (ahead ${AHEAD}) — plugin-refresh will reset --hard, or run: git -C \"$CLONE\" fetch origin main && git -C \"$CLONE\" reset --hard origin/main"
  elif [ "$LOCAL_SHA" != "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "unknown" ]; then
    bad "marketplace behind origin/main $(short "$REMOTE_SHA")"
  else
    ok "marketplace matches origin/main"
  fi
else
  bad "missing marketplace clone at ${CLONE}"
fi

section "Claude plugin versions"
python3 - <<'PY'
import json, os
from pathlib import Path

home = Path.home()
mp_name = os.environ.get("SIMPL_MARKETPLACE_NAME", "simpl")
clone = home / ".claude" / "plugins" / "marketplaces" / mp_name
installed_path = home / ".claude" / "plugins" / "installed_plugins.json"
core = ["simpl-standards", "simpl-memory", "simpl-libraries"]

mp_versions = {}
mp_file = clone / ".claude-plugin" / "marketplace.json"
if mp_file.exists():
    mp = json.loads(mp_file.read_text())
    for p in mp.get("plugins", []):
        if p.get("name") and p.get("version"):
            mp_versions[p["name"]] = str(p["version"])

installed = {}
if installed_path.exists():
    data = json.loads(installed_path.read_text())
    for key, entries in (data.get("plugins") or {}).items():
        name = key.split("@")[0]
        lst = entries if isinstance(entries, list) else [entries]
        if lst and isinstance(lst[0], dict) and lst[0].get("version"):
            installed[name] = str(lst[0]["version"])

def cmp(a, b):
    pa = [int(x) if x.isdigit() else 0 for x in str(a).split(".")]
    pb = [int(x) if x.isdigit() else 0 for x in str(b).split(".")]
    n = max(len(pa), len(pb))
    for i in range(n):
        da = pa[i] if i < len(pa) else 0
        db = pb[i] if i < len(pb) else 0
        if da < db: return -1
        if da > db: return 1
    return 0

for name in core:
    want = mp_versions.get(name)
    have = installed.get(name)
    if not want:
        print(f"  ⚠ {name}: not in marketplace.json")
        continue
    if not have:
        print(f"  ✗ {name}: not installed (marketplace {want})")
        continue
    if cmp(have, want) < 0:
        print(f"  ✗ {name}: installed {have} < marketplace {want} — /plugin install {name}@{mp_name}")
    else:
        print(f"  ✓ {name}: installed {have} (marketplace {want})")
PY

section "Local state"
STATE="${HOME}/.simpl_knowledge/state.json"
if [ -f "$STATE" ]; then
  ok "state.json present"
  python3 -c "import json,pathlib; print(' ', pathlib.Path('${STATE}').read_text().strip())" 2>/dev/null || true
else
  warn "no ~/.simpl_knowledge/state.json yet (created on first session-refresh)"
fi

section "Repo tip"
ok "from clone: bash ${ROOT}/scripts/team-bootstrap.sh"
ok "force refresh: SIMPL_KNOWLEDGE_FORCE_REFRESH=1 node ${HOME}/.cursor/hooks/shared-hooks/session-refresh.js"
printf '\n'
