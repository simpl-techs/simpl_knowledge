#!/usr/bin/env bash
# Regenerate .cursor/rules/repo-internal.mdc from .agent/INTERNAL.md (no manual drift).

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  exit 0
fi
INTERNAL="$ROOT/.agent/INTERNAL.md"
OUT="$ROOT/.cursor/rules/repo-internal.mdc"
if [ ! -f "$INTERNAL" ]; then
  exit 0
fi
mkdir -p "$ROOT/.cursor/rules"
export REPO_ROOT="$ROOT"

python3 <<'PY'
import pathlib, re, sys, os
root = pathlib.Path(os.environ["REPO_ROOT"])
internal = root / ".agent" / "INTERNAL.md"
out = root / ".cursor" / "rules" / "repo-internal.mdc"
text = internal.read_text(encoding="utf-8")
m = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
if not m:
    sys.exit(0)
fm = m.group(1)
body = m.group(2).strip() + "\n"
desc = "Internal conventions for this repo."
globs = "src/**/*,tests/**/*"
for line in fm.splitlines():
    if line.strip().startswith("description:"):
        rest = line.split(":", 1)[1].strip()
        if rest.startswith('"') and rest.endswith('"'):
            rest = rest[1:-1]
        desc = rest[:200]
    if line.strip().startswith("cursor_globs:"):
        rest = line.split(":", 1)[1].strip()
        if rest.startswith('"') and rest.endswith('"'):
            rest = rest[1:-1]
        globs = rest
front = f"""---
description: "{desc.replace('"', "'")}"
globs: "{globs}"
alwaysApply: false
---

# Repo-internal (generated)

> Auto-generated from `.agent/INTERNAL.md` by `.claude/hooks/sync-cursor-internal.sh`. Do not edit by hand.

"""
out.write_text(front + body, encoding="utf-8")
PY
