#!/usr/bin/env bash
# Copy simpl_knowledge Cursor rules into ~/.cursor/rules/ for cloud agents.
#
# Cloud agents do not run Claude Code marketplace install — only the .mdc rules
# need to be present globally. Idempotent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KNOWLEDGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CURSOR_RULES="${HOME}/.cursor/rules"
SRC_DIR="${KNOWLEDGE_ROOT}/cursor-rules"

say() { printf '[knowledge-cloud] %s\n' "$*"; }
fail() { printf '[knowledge-cloud] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ ! -d "${SRC_DIR}" ]]; then
    fail "cursor-rules directory not found: ${SRC_DIR}"
fi

mkdir -p "${CURSOR_RULES}"

count=0
for f in "${SRC_DIR}"/*.mdc; do
    [[ -f "${f}" ]] || continue
    base="$(basename "${f}")"
    target="${CURSOR_RULES}/${base}"
    if [[ -f "${target}" ]] && ! cmp -s "${f}" "${target}"; then
        cp "${target}" "${target}.bak"
        say "backed up existing ${base} -> ${base}.bak"
    fi
    cp "${f}" "${target}"
    count=$((count + 1))
done

if [[ "${count}" -eq 0 ]]; then
    fail "no .mdc files found in ${SRC_DIR}"
fi

say "installed ${count} Cursor rules to ${CURSOR_RULES}"
