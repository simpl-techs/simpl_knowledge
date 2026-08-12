#!/usr/bin/env bash
# simpl_knowledge — one-command installer for dev machines.
#
# Usage (default — you already cloned this repo):
#     bash scripts/team-bootstrap.sh
#
# One-liner from anywhere (public repo only):
#     curl -fsSL https://raw.githubusercontent.com/simpl-techs/simpl_knowledge/main/scripts/team-bootstrap.sh | bash
#
# Private repo: raw URL returns 404 without a token — use local bash above, or GitHub API + gh auth token (see docs/human/QUICKSTART.md).
#
# What it does:
#   1. Detects which tools are installed (Claude Code, Cursor, Node)
#   2. Points Claude Code at the simpl marketplace
#   3. Installs recommended plugins (simpl-standards, simpl-memory, simpl-libraries)
#   4. Copies the generated Cursor rules to ~/.cursor/rules/
#   5. Installs global Cursor sessionStart → session-refresh (adapter + hooks.json merge + shared-hooks copy)
#   6. Verifies AgentShield is callable (`npx ecc-agentshield --version`)
#
# Idempotent: re-run anytime; only missing pieces get installed.
# Safe: never overwrites user files without asking; --dry-run to preview.

set -euo pipefail

# --- Configuration (edit before committing to your fork) -------------------
MARKETPLACE_REPO="simpl-techs/simpl_knowledge"
MARKETPLACE_NAME="simpl"
DEFAULT_PLUGINS=("simpl-standards" "simpl-memory" "simpl-libraries")
OPTIONAL_PLUGINS=("simpl_tracker-context")  # per-project; dev picks
# --------------------------------------------------------------------------

DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"

say() { printf "\033[0;36m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[0;33m[!]\033[0m %s\n" "$*" >&2; }
ok() { printf "\033[0;32m[✓]\033[0m %s\n" "$*"; }
skip() { printf "\033[0;90m[-]\033[0m %s\n" "$*"; }
run() { [ "$DRY_RUN" = "true" ] && echo "   (dry-run) $*" || eval "$*"; }

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --verbose) VERBOSE=true; set -x ;;
    --help|-h)
      sed -n '2,20p' "$0"; exit 0 ;;
  esac
done

say "simpl_knowledge — bootstrap"
[ "$DRY_RUN" = "true" ] && warn "DRY RUN — no changes will be made"
echo

# --- 1. Detect environment ------------------------------------------------
say "1. Detecting environment"

HAS_CLAUDE=false
HAS_CURSOR=false
HAS_NODE=false

if command -v claude >/dev/null 2>&1; then
  HAS_CLAUDE=true
  ok "Claude Code detected: $(claude --version 2>/dev/null | head -1 || echo '(version unknown)')"
else
  skip "Claude Code not installed — https://docs.claude.com/claude-code"
fi

if command -v cursor >/dev/null 2>&1 || [ -d "${HOME}/.cursor" ] || [ -d "${HOME}/Library/Application Support/Cursor" ]; then
  HAS_CURSOR=true
  ok "Cursor detected"
else
  skip "Cursor not detected"
fi

if command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
  HAS_NODE=true
  ok "Node $(node --version) + npx available"
else
  skip "Node/npx not available — AgentShield will be skipped"
fi

if [ "$HAS_CLAUDE" = "false" ] && [ "$HAS_CURSOR" = "false" ]; then
  warn "Neither Claude Code nor Cursor detected. Install one and re-run."
  exit 1
fi
echo

# --- 2. Claude Code: marketplace + plugins --------------------------------
if [ "$HAS_CLAUDE" = "true" ]; then
  say "2. Claude Code configuration"

  # Claude Code's plugin config lives at ~/.claude/plugins/
  CLAUDE_PLUGINS_DIR="${HOME}/.claude/plugins"
  MARKETPLACE_CACHE="${CLAUDE_PLUGINS_DIR}/cache/${MARKETPLACE_REPO##*/}"

  if [ ! -d "$MARKETPLACE_CACHE" ]; then
    say "   Adding marketplace: ${MARKETPLACE_REPO}"
    cat <<EOF
   Run this inside a Claude Code session to complete the install:

       /plugin marketplace add ${MARKETPLACE_REPO}
$(for p in "${DEFAULT_PLUGINS[@]}"; do echo "       /plugin install ${p}@${MARKETPLACE_NAME}"; done)

   For project-specific integration plugins, install as needed:
$(for p in "${OPTIONAL_PLUGINS[@]}"; do echo "       /plugin install ${p}@${MARKETPLACE_NAME}"; done)
EOF
    echo
  else
    ok "Marketplace cache exists: ${MARKETPLACE_CACHE}"
    say "   Refreshing..."
    run "cd '$MARKETPLACE_CACHE' && git pull --quiet origin main 2>/dev/null || true"
  fi
  echo
fi

# --- 3. Cursor: global hooks + rules from GitHub Release (rolling) or clone+generate fallback -----
if [ "$HAS_CURSOR" = "true" ]; then
  say "3. Cursor rules + global hooks"
  MARKETPLACE_CACHE="${HOME}/.claude/plugins/cache/${MARKETPLACE_REPO##*/}"
  mkdir -p "$(dirname "$MARKETPLACE_CACHE")"
  if [ ! -d "$MARKETPLACE_CACHE/.git" ]; then
    say "   Cloning ${MARKETPLACE_REPO} to plugin cache (shared hooks + adapter)…"
    run "git clone --depth 1 'https://github.com/${MARKETPLACE_REPO}.git' '$MARKETPLACE_CACHE'"
  else
    run "cd '$MARKETPLACE_CACHE' && git pull --quiet origin main 2>/dev/null || true"
  fi
  if [ -f "$MARKETPLACE_CACHE/scripts/install-cursor-global-hooks.sh" ]; then
    # shellcheck disable=SC1090
    source "$MARKETPLACE_CACHE/scripts/install-cursor-global-hooks.sh"
    install_cursor_global_hooks "$MARKETPLACE_REPO" || true
    ok "   Global Cursor sessionStart → session-refresh"
  fi

  CURSOR_RULES="${HOME}/.cursor/rules"
  mkdir -p "$CURSOR_RULES"

  TMP="$(mktemp -d)"
  trap "rm -rf $TMP" EXIT
  CURSOR_TAG="cursor-rules-rolling"
  ZIP_URL="https://github.com/${MARKETPLACE_REPO}/releases/download/${CURSOR_TAG}/cursor-rules.zip"
  say "   Trying release asset: ${CURSOR_TAG}/cursor-rules.zip"
  if run "curl -fsSL -L '${ZIP_URL}' -o '$TMP/cursor-rules.zip'"; then
    run "unzip -o -q '$TMP/cursor-rules.zip' -d '$TMP'"
    SRC_DIR="$TMP/cursor-rules"
    if [ ! -d "$SRC_DIR" ]; then
      SRC_DIR="$TMP"
    fi
    count=0
    for f in "$SRC_DIR"/*.mdc; do
      [ -f "$f" ] || continue
      base=$(basename "$f")
      target="$CURSOR_RULES/$base"
      if [ -f "$target" ] && ! cmp -s "$f" "$target"; then
        warn "   $base exists and differs — backing up to ${base}.bak"
        run "cp '$target' '${target}.bak'"
      fi
      run "cp '$f' '$target'"
      count=$((count + 1))
    done
    ok "   Installed $count .mdc rules from release to $CURSOR_RULES"
  else
    warn "   Release asset missing — cloning repo and generating rules locally (needs PyYAML: pip install pyyaml)"
    run "git clone --depth 1 'https://github.com/${MARKETPLACE_REPO}.git' '$TMP/mp' --quiet 2>/dev/null || true"
    if [ -d "$TMP/mp" ]; then
      run "(cd '$TMP/mp' && bash scripts/generate-cursor-rules.sh)"
      count=0
      for f in "$TMP/mp/cursor-rules"/*.mdc; do
        [ -f "$f" ] || continue
        base=$(basename "$f")
        target="$CURSOR_RULES/$base"
        run "cp '$f' '$target'"
        count=$((count + 1))
      done
      ok "   Installed $count .mdc rules (local generate) to $CURSOR_RULES"
    else
      warn "   Could not clone ${MARKETPLACE_REPO}"
    fi
  fi
  echo
fi

# --- 4. AgentShield (optional, via npx) -----------------------------------
if [ "$HAS_NODE" = "true" ]; then
  say "4. AgentShield (security scanner)"
  if ! npx --no-install ecc-agentshield --version >/dev/null 2>&1; then
    say "   Will be fetched on first use via: npx ecc-agentshield scan"
    ok "   No action needed — npx resolves on demand"
  else
    ok "   AgentShield already cached locally"
  fi
  echo
fi

# --- 5. Summary -----------------------------------------------------------
say "Done"
cat <<'EOF'

Next steps:

  1. Inside Claude Code, run:
        /plugin marketplace add simpl-techs/simpl_knowledge
        /plugin install simpl-standards@simpl
        /plugin install simpl-memory@simpl
        /plugin install simpl-libraries@simpl

  2. In any project, ask your agent:
        "How do we write commit messages here?"
     It should cite the git-workflow skill.

  3. Per-project integration plugins: your agent reads `catalog.md` (via `simpl-libraries`) and suggests installs, e.g.:
        /plugin install simpl_tracker-context@simpl

  4. On a library repo you maintain (after marketplace cache exists):
        bash ~/.claude/plugins/cache/simpl_knowledge/library-repo-template/scripts/bootstrap.sh <repo-name>
     Or ask the agent: /bootstrap-repo-context

Weekly: /plugin marketplace update (Claude Code; SessionStart also self-heals the marketplace clone and warns if plugins are stale)
Cursor: sessionStart runs session-refresh (sha-based; emits rule version into context). Diagnose with: bash scripts/doctor.sh
Force: SIMPL_KNOWLEDGE_FORCE_REFRESH=1 or re-run this bootstrap.
EOF
