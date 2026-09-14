#!/usr/bin/env bash
# Legacy entry point; keep installation policy in team-bootstrap.sh.
set -euo pipefail
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_ROOT/team-bootstrap.sh" "$@"
