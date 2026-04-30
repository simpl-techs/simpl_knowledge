#!/usr/bin/env bash
# Apply the library-repo-template to an existing repository.
# Idempotent: re-running it will only create files that don't already exist.
#
# Usage:
#   cd /path/to/your-library-repo
#   bash /path/to/library-repo-template/scripts/bootstrap.sh <repo-name>
#
# Example:
#   bash /path/to/library-repo-template/scripts/bootstrap.sh simple-tracker

set -euo pipefail

REPO_NAME="${1:-}"
if [ -z "$REPO_NAME" ]; then
  echo "Usage: bootstrap.sh <repo-name>"
  echo "  Run from the root of the repo you want to instrument."
  exit 1
fi

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$(pwd)"

if [ ! -d .git ]; then
  echo "✗ Not a git repo. Run this from the root of your library."
  exit 1
fi

echo "Bootstrapping agent context in: $TARGET_DIR"
echo "  (using template from: $TEMPLATE_DIR)"
echo

# --- .agent/ ---
mkdir -p .agent
for f in SKILL.md INTERNAL.md README.md; do
  if [ -f ".agent/$f" ]; then
    echo "  ⚠ .agent/$f already exists — skipping"
  else
    sed "s/REPO-NAME/$REPO_NAME/g; s/REPLACE-ME-with-repo-name/$REPO_NAME/g; s/REPLACE-ME/$REPO_NAME/g" \
      "$TEMPLATE_DIR/.agent/$f" > ".agent/$f"
    echo "  ✓ created .agent/$f"
  fi
done

# --- .claude/ ---
mkdir -p .claude/commands .claude/hooks
for f in settings.json; do
  if [ -f ".claude/$f" ]; then
    echo "  ⚠ .claude/$f already exists — skipping"
  else
    cp "$TEMPLATE_DIR/.claude/$f" ".claude/$f"
    echo "  ✓ created .claude/$f"
  fi
done
for f in "commands/update-skill.md" "hooks/session-start-refresh.sh" "hooks/sync-cursor-internal.sh"; do
  if [ -f ".claude/$f" ]; then
    echo "  ⚠ .claude/$f already exists — skipping"
  else
    cp "$TEMPLATE_DIR/.claude/$f" ".claude/$f"
    echo "  ✓ created .claude/$f"
  fi
done
chmod +x .claude/hooks/session-start-refresh.sh .claude/hooks/sync-cursor-internal.sh

# --- scripts/ (repo root) ---
mkdir -p scripts
for f in "sanitize-commit-digest.py"; do
  if [ -f "scripts/$f" ]; then
    echo "  ⚠ scripts/$f already exists — skipping"
  else
    cp "$TEMPLATE_DIR/scripts/$f" "scripts/$f"
    echo "  ✓ created scripts/$f"
  fi
done

# --- .cursor/ ---
mkdir -p .cursor/rules
for f in "rules/repo-internal.mdc"; do
  if [ -f ".cursor/$f" ]; then
    echo "  ⚠ .cursor/$f already exists — skipping"
  else
    cp "$TEMPLATE_DIR/.cursor/$f" ".cursor/$f"
    echo "  ✓ created .cursor/$f"
  fi
done

# --- .github/ ---
mkdir -p .github/workflows
for f in "workflows/auto-update-skill.yml" "workflows/sync-skill-to-marketplace.yml" "pull_request_template.md"; do
  if [ -f ".github/$f" ]; then
    echo "  ⚠ .github/$f already exists — skipping"
  else
    cp "$TEMPLATE_DIR/.github/$f" ".github/$f"
    echo "  ✓ created .github/$f"
  fi
done

# --- CLAUDE.md ---
if [ -f "CLAUDE.md" ]; then
  echo "  ⚠ CLAUDE.md already exists — skipping"
else
  sed "s/REPLACE-ME/$REPO_NAME/g" "$TEMPLATE_DIR/CLAUDE.md" > "CLAUDE.md"
  echo "  ✓ created CLAUDE.md"
fi

echo
if [ -f ".claude/hooks/sync-cursor-internal.sh" ]; then
  bash ".claude/hooks/sync-cursor-internal.sh" || true
fi

echo "=== Done ==="
echo
echo "Next steps:"
echo "  1. Edit .agent/SKILL.md — fill in the placeholders with YOUR library's reality."
echo "  2. Edit .agent/INTERNAL.md — document the internal conventions for this repo."
echo "  3. Make sure the org-level secrets DEEPSEEK_API_KEY and SIMPL_KNOWLEDGE_PAT are set."
echo "  4. Commit and push:"
echo "       git add .agent/ .claude/ .cursor/ .github/ scripts/ CLAUDE.md"
echo "       git commit -m 'chore(agent): bootstrap agent context'"
echo "       git push"
echo "  5. On merge to main, the sync workflow will open a PR in the marketplace."
echo "  6. Announce in #engineering: 'use /plugin install ${REPO_NAME}-context@simpl'"
