#!/usr/bin/env bash
# SessionStart: refresh simpl_knowledge cache + optional repo drift check (Claude hook stdout).
# Registered in .claude/settings.json under SessionStart.

set -euo pipefail

SHARED="${SIMPL_SHARED_HOOKS:-$HOME/.claude/plugins/cache/simpl_knowledge/scripts/shared-hooks}"
if [ ! -f "$SHARED/session-refresh.js" ]; then
  exit 0
fi

node "$SHARED/session-refresh.js" --claude-session-hook < /dev/null
exit 0
