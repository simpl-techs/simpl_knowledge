#!/usr/bin/env python3
"""
Harden git-log derived digest for LLM consumption: cap size, drop injection-y lines.
Input path -> output path (safe for prompt inclusion as untrusted data).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SUSPICIOUS = re.compile(
    r"(?i)(ignore\s+(all\s+)?(previous|above|prior)|"
    r"disregard\s+(all\s+)?(previous|above|prior)|"
    r"<\s*/?\s*system|"
    r"```\s*\w*|"
    r"you\s+must\s+now|"
    r"new\s+instructions\s*:)",
)


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: sanitize-commit-digest.py INPUT OUTPUT", file=sys.stderr)
        sys.exit(2)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    raw = src.read_text(encoding="utf-8", errors="replace")
    lines = []
    for line in raw.splitlines():
        if SUSPICIOUS.search(line):
            lines.append("[LINE_REMOVED: matched suspicious pattern]")
            continue
        # Cap individual line length (obfuscated payloads)
        if len(line) > 500:
            line = line[:500] + "…"
        lines.append(line)
    out = "\n".join(lines)
    if len(out) > 15_000:
        out = out[:15_000] + "\n… [TRUNCATED]"
    dst.write_text(out + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
