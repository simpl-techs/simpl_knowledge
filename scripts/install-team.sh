#!/usr/bin/env bash
# Install simpl-knowledge context for Claude Code + Cursor.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/simpl/simpl-knowledge/main/scripts/install-team.sh | bash

set -euo pipefail

MARKETPLACE_REPO="simpl/simpl-knowledge"
MARKETPLACE_URL="https://github.com/${MARKETPLACE_REPO}"
MARKETPLACE_CACHE="${HOME}/.claude/plugins/cache/${MARKETPLACE_REPO##*/}"
CURSOR_TAG="cursor-rules-rolling"

echo "=== simpl-knowledge installer ==="
echo

if command -v claude >/dev/null 2>&1; then
  echo "✓ Claude Code detected."
  echo "  In Claude Code:"
  echo "     /plugin marketplace add ${MARKETPLACE_REPO}"
  echo "     /plugin install simpl-standards@simpl"
  echo "     /plugin install simpl-memory@simpl"
  echo "     /plugin install simpl-libraries@simpl"
  echo
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

cat <<EOF
=== Refresh behavior ===

  Cursor: built-in sessionStart hook refreshes simpl-knowledge cache + org rules (simpl-*.mdc), throttled ~6h.
  Claude Code: SessionStart in plugins runs the same shared session-refresh.js (after marketplace cache exists).

Test: ask the agent how commit messages work (git-workflow).
EOF
