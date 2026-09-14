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
#   1. Detects which tools are installed (Claude Code, Cursor, Codex, Node)
#   2. Points Claude Code at the simpl marketplace
#   3. Installs recommended plugins (simpl-standards, simpl-memory, simpl-libraries)
#   4. Copies the generated Cursor rules to ~/.cursor/rules/
#   5. Installs global Cursor sessionStart → session-refresh (adapter + hooks.json merge + shared-hooks copy)
#   6. Links org skills into ~/.agents/skills + ~/.codex/skills, managed block in ~/.codex/AGENTS.md
#   7. Verifies AgentShield is callable (`npx ecc-agentshield --version`)
#
# Idempotent: re-run to align detected agents with the published cache.
# Preserves personal skill directories and text outside managed markers.

set -euo pipefail

# --- Configuration (edit before committing to your fork) -------------------
MARKETPLACE_REPO="simpl-techs/simpl_knowledge"
MARKETPLACE_NAME="simpl"
DEFAULT_PLUGINS=("simpl-standards" "simpl-memory" "simpl-libraries")
# --------------------------------------------------------------------------

DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"

say() { printf "\033[0;36m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[0;33m[!]\033[0m %s\n" "$*" >&2; }
ok() { printf "\033[0;32m[✓]\033[0m %s\n" "$*"; }
skip() { printf "\033[0;90m[-]\033[0m %s\n" "$*"; }

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
HAS_CODEX=false
HAS_NODE=false

MARKETPLACE_CACHE="${HOME}/.simpl_knowledge/cache"

# Clone (or refresh) the marketplace clone every consumer reads from.
ensure_marketplace_cache() {
  mkdir -p "$(dirname "$MARKETPLACE_CACHE")"
  if [ ! -d "$MARKETPLACE_CACHE/.git" ]; then
    say "   Cloning ${MARKETPLACE_REPO} to plugin cache (shared hooks + skills)…"
    git clone --depth 1 "https://github.com/${MARKETPLACE_REPO}.git" "$MARKETPLACE_CACHE"
  else
    git -C "$MARKETPLACE_CACHE" fetch --quiet origin main
    git -C "$MARKETPLACE_CACHE" merge --ff-only origin/main
  fi
}

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

if command -v codex >/dev/null 2>&1 || [ -d "${HOME}/.codex" ] || [ -d "${HOME}/.agents/skills" ]; then
  HAS_CODEX=true
  ok "Codex detected"
else
  skip "Codex not detected"
fi

if command -v node >/dev/null 2>&1; then
  HAS_NODE=true
  ok "Node $(node --version) available"
else
  skip "Node/npx not available — AgentShield will be skipped"
fi

if [ "$HAS_CLAUDE" = "false" ] && [ "$HAS_CURSOR" = "false" ] && [ "$HAS_CODEX" = "false" ]; then
  warn "None of Claude Code, Cursor or Codex detected. Install one and re-run."
  exit 1
fi
echo

if [ "$HAS_NODE" != "true" ] || ! command -v python3 >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  warn "Node, Python 3 and Git are required. Install them and re-run."
  exit 1
fi
if [ "$DRY_RUN" = "true" ]; then
  say "Preview: refresh cache; configure detected agents; install core Claude plugins; sync Cursor hooks/rules and Codex skills; run doctor."
  exit 0
fi

ensure_marketplace_cache
LEGACY_CACHE="${HOME}/.claude/plugins/cache/simpl_knowledge"
if [ -d "$LEGACY_CACHE" ] && [ ! -L "$LEGACY_CACHE" ]; then
  LEGACY_BACKUP="${HOME}/.simpl_knowledge/backups/legacy-cache-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$(dirname "$LEGACY_BACKUP")"
  mv "$LEGACY_CACHE" "$LEGACY_BACKUP"
  ok "Legacy shared cache preserved at $LEGACY_BACKUP"
fi
SCRIPT_ROOT="$MARKETPLACE_CACHE/scripts"
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  LOCAL_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$LOCAL_SCRIPTS/shared-hooks/sync-codex-knowledge.js" ]; then
    SCRIPT_ROOT="$LOCAL_SCRIPTS"
  fi
fi

# --- 2. Claude Code: marketplace + plugins --------------------------------
enable_claude_autoupdate() {
  python3 - "$MARKETPLACE_REPO" <<'PY'
import json, sys
from pathlib import Path

repo = sys.argv[1]
home = Path.home()
settings_path = home / ".claude" / "settings.json"
known_path = home / ".claude" / "plugins" / "known_marketplaces.json"

settings = {}
if settings_path.exists():
    settings = json.loads(settings_path.read_text())
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
}

if [ "$HAS_CLAUDE" = "true" ]; then
  say "2. Claude Code configuration"

  say "   Installing marketplace + core plugins via Claude CLI"
  claude plugin marketplace add "$MARKETPLACE_REPO" --scope user
  claude plugin marketplace update "$MARKETPLACE_NAME"
  if [ "$DRY_RUN" != "true" ]; then
    enable_claude_autoupdate
  fi
  for p in "${DEFAULT_PLUGINS[@]}"; do
    claude plugin install "${p}@${MARKETPLACE_NAME}" --scope user
    claude plugin update "${p}@${MARKETPLACE_NAME}" --scope user
  done
  ok "   Core plugins + autoUpdate=true"
  echo
fi

# --- 3. Cursor: install from the authenticated cache ----------------------
if [ "$HAS_CURSOR" = "true" ]; then
  say "3. Cursor rules + global hooks"
  source "$SCRIPT_ROOT/install-cursor-global-hooks.sh"
  install_cursor_global_hooks "$MARKETPLACE_REPO"
  mkdir -p "$HOME/.cursor/rules"
  for rule in "$MARKETPLACE_CACHE"/cursor-rules/simpl-*.mdc; do
    [ -f "$rule" ] || { warn "No generated Cursor rules in cache"; exit 1; }
    cp "$rule" "$HOME/.cursor/rules/"
  done
  ok "   Cursor hooks and rules installed from cache"
fi

# --- 4. Codex: global skills + AGENTS.md ----------------------------------
if [ "$HAS_CODEX" = "true" ]; then
  say "4. Codex skills + AGENTS.md"
  CODEX_SYNC="$SCRIPT_ROOT/shared-hooks/sync-codex-knowledge.js"
  if [ "$HAS_NODE" = "true" ] && [ -f "$CODEX_SYNC" ]; then
    SIMPL_CODEX_FORCE=1 node "$CODEX_SYNC" "$MARKETPLACE_CACHE"
    ok "   Skills symlinked to ~/.agents/skills + ~/.codex/skills, managed block in ~/.codex/AGENTS.md"
  else
    warn "   Needs Node — install Node and re-run to enable Codex skills"
  fi
  echo
fi

# --- 5. AgentShield (optional, via npx) -----------------------------------
if command -v npx >/dev/null 2>&1; then
  say "5. AgentShield (security scanner)"
  if ! npx --no-install ecc-agentshield --version >/dev/null 2>&1; then
    say "   Will be fetched on first use via: npx ecc-agentshield scan"
    ok "   No action needed — npx resolves on demand"
  else
    ok "   AgentShield already cached locally"
  fi
  echo
fi

bash "$SCRIPT_ROOT/doctor.sh"

# --- 6. Summary -----------------------------------------------------------
say "Done"
cat <<'EOF'

Next steps:

  1. In any project, ask your agent:
        "How do we write commit messages here?"
     It should cite the git-workflow skill.

  2. Per-project integration plugins: your agent reads `catalog.md` (via `simpl-libraries`) and suggests installs, e.g.:
        /plugin install simpl_tracker-context@simpl

  3. On a library repo you maintain (after marketplace cache exists):
        bash ~/.simpl_knowledge/cache/library-repo-template/scripts/bootstrap.sh <repo-name>
     Or ask the agent: /bootstrap-repo-context

Cursor: sessionStart runs session-refresh (sha-based; emits rule version into context).
Claude Code: SessionStart plugin-refresh updates stale plugins; marketplace autoUpdate is on.
Codex: skills are symlinks to the cache, so a cache refresh updates them; session-refresh re-links on every Cursor/Claude session.
Diagnose: bash scripts/doctor.sh
Force: SIMPL_KNOWLEDGE_FORCE_REFRESH=1 or re-run this bootstrap.
EOF
