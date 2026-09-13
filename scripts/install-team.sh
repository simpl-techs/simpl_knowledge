#!/usr/bin/env bash
# Install simpl_knowledge context for Claude Code + Cursor + Codex.
#
# Usage (from clone, recommended):
#   bash scripts/install-team.sh
#
# From anywhere (public repo):
#   curl -fsSL https://raw.githubusercontent.com/simpl-techs/simpl_knowledge/main/scripts/install-team.sh | bash

set -euo pipefail

MARKETPLACE_REPO="simpl-techs/simpl_knowledge"
MARKETPLACE_URL="https://github.com/${MARKETPLACE_REPO}"
MARKETPLACE_CACHE="${HOME}/.claude/plugins/cache/${MARKETPLACE_REPO##*/}"
CURSOR_TAG="cursor-rules-rolling"

echo "=== simpl_knowledge installer ==="
echo

if command -v claude >/dev/null 2>&1; then
  echo "✓ Claude Code detected — installing marketplace + core plugins"
  claude plugin marketplace add "${MARKETPLACE_REPO}" --scope user || true
  python3 - "${MARKETPLACE_REPO}" <<'PY'
import json, sys
from pathlib import Path
repo = sys.argv[1]
home = Path.home()
settings_path = home / ".claude" / "settings.json"
known_path = home / ".claude" / "plugins" / "known_marketplaces.json"
settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
ekm = settings.setdefault("extraKnownMarketplaces", {})
entry = ekm.setdefault("simpl", {})
entry["source"] = {"source": "github", "repo": repo}
entry["autoUpdate"] = True
enabled = settings.setdefault("enabledPlugins", {})
for name in ("simpl-standards@simpl", "simpl-memory@simpl", "simpl-libraries@simpl"):
    enabled[name] = True
settings_path.parent.mkdir(parents=True, exist_ok=True)
settings_path.write_text(json.dumps(settings, indent=2) + "\n")
if known_path.exists():
    known = json.loads(known_path.read_text())
    if isinstance(known.get("simpl"), dict):
        known["simpl"]["autoUpdate"] = True
        known_path.write_text(json.dumps(known, indent=2) + "\n")
PY
  for p in simpl-standards simpl-memory simpl-libraries; do
    claude plugin install "${p}@simpl" --scope user || claude plugin update "${p}@simpl" --scope user || true
  done
  echo "  Per-project integration plugins (agent suggests from catalog), e.g.:"
  echo "     /plugin install simpl_tracker-context@simpl"
  echo
else
  echo "⚠ Claude Code not installed — https://docs.claude.com/claude-code"
  echo
fi

if command -v cursor >/dev/null 2>&1 || [ -d "$HOME/.cursor" ]; then
  echo "✓ Cursor detected."

  mkdir -p "$(dirname "$MARKETPLACE_CACHE")"
  if [ ! -d "$MARKETPLACE_CACHE/.git" ]; then
    echo "  Cloning ${MARKETPLACE_REPO} to ${MARKETPLACE_CACHE} …"
    git clone --depth 1 "${MARKETPLACE_URL}.git" "$MARKETPLACE_CACHE"
  else
    (cd "$MARKETPLACE_CACHE" && git pull --quiet origin main 2>/dev/null || true)
  fi

  if [ -f "$MARKETPLACE_CACHE/scripts/install-cursor-global-hooks.sh" ]; then
    # shellcheck disable=SC1090
    source "$MARKETPLACE_CACHE/scripts/install-cursor-global-hooks.sh"
    install_cursor_global_hooks "$MARKETPLACE_REPO" || true
    echo "  ✓ Global sessionStart → session-refresh (~/.cursor/hooks.json)"
  fi

  CURSOR_RULES_DIR="${HOME}/.cursor/rules"
  mkdir -p "$CURSOR_RULES_DIR"
  TMP=$(mktemp -d)
  trap "rm -rf $TMP" EXIT
  ZIP_URL="${MARKETPLACE_URL}/releases/download/${CURSOR_TAG}/cursor-rules.zip"
  echo "  Downloading ${CURSOR_TAG}/cursor-rules.zip …"
  if curl -fsSL -L "$ZIP_URL" -o "$TMP/cursor-rules.zip"; then
    unzip -o -q "$TMP/cursor-rules.zip" -d "$TMP"
    SRC="$TMP/cursor-rules"
    [ -d "$SRC" ] || SRC="$TMP"
    n=0
    for f in "$SRC"/*.mdc; do
      [ -f "$f" ] || continue
      cp "$f" "$CURSOR_RULES_DIR/"
      n=$((n + 1))
    done
    echo "  ✓ Installed $n rules → $CURSOR_RULES_DIR"
  else
    echo "  ⚠ Release zip missing — run team-bootstrap.sh (clone + generate fallback) or wait for CI."
  fi
  echo
else
  echo "ⓘ Cursor not detected — skipping."
  echo
fi

if command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ] || [ -d "$HOME/.agents/skills" ]; then
  echo "✓ Codex detected."
  CODEX_SYNC="$MARKETPLACE_CACHE/scripts/shared-hooks/sync-codex-knowledge.js"
  if command -v node >/dev/null 2>&1 && [ -f "$CODEX_SYNC" ]; then
    SIMPL_CODEX_FORCE=1 node "$CODEX_SYNC" "$MARKETPLACE_CACHE"
    echo "  ✓ Skills → ~/.agents/skills + ~/.codex/skills, managed block → ~/.codex/AGENTS.md"
  else
    echo "  ⚠ Needs Node + marketplace cache — run team-bootstrap.sh"
  fi
  echo
else
  echo "ⓘ Codex not detected — skipping."
  echo
fi

cat <<EOF
=== Refresh behavior ===

  Cursor: global sessionStart → session-refresh (sha-based; hooks.sessionStart must be an array under hooks).
  Claude Code: SessionStart plugin-refresh self-heals the marketplace clone and updates stale plugins.
  Codex: ~/.agents/skills + ~/.codex/skills are symlinks into the cache; session-refresh re-links them each Cursor/Claude session.
  Diagnose: bash scripts/doctor.sh (from a simpl_knowledge clone).

Test: ask the agent how commit messages work (git-workflow).
EOF
