#!/usr/bin/env python3
"""
Best-effort: scan plugins/**/SKILL.md fenced code blocks for Python identifiers
and check they exist under simpl-knowledge/ tree. Integration skills that only
reference external packages will produce skips (no warnings). Exit 0 always;
prints warnings to stdout for humans in CI logs.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def py_files() -> list[Path]:
    return [p for p in ROOT.rglob("*.py") if ".git" not in p.parts]


def collect_defs(files: list[Path]) -> set[str]:
    names: set[str] = set()
    def_re = re.compile(r"^(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", re.M)
    class_re = re.compile(r"^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\b", re.M)
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        names.update(def_re.findall(text))
        names.update(class_re.findall(text))
    return names


def extract_py_idents(code: str) -> set[str]:
    # Heuristic: words that look like ClassName or function calls word(
    out: set[str] = set()
    for m in re.finditer(r"\b([A-Z][a-zA-Z0-9_]*)\b", code):
        out.add(m.group(1))
    for m in re.finditer(r"\b([a-z_][a-z0-9_]*)\s*\(", code):
        out.add(m.group(1))
    return out


def main() -> None:
    defs = collect_defs(py_files())
    skill_files = list((ROOT / "plugins").rglob("SKILL.md"))
    warn_count = 0
    fence_re = re.compile(r"```python\n(.*?)```", re.DOTALL)
    for sf in skill_files:
        text = sf.read_text(encoding="utf-8", errors="ignore")
        for block in fence_re.findall(text):
            for ident in extract_py_idents(block):
                if len(ident) < 3 or ident in {
                    "for",
                    "if",
                    "in",
                    "is",
                    "or",
                    "and",
                    "not",
                    "def",
                    "try",
                    "with",
                    "from",
                    "import",
                    "return",
                    "True",
                    "False",
                    "None",
                    "Act",
                    "Arrange",
                    "Assert",
                }:
                    continue
                # Env-style or example identifiers from integration skills
                if ident.isupper() and "_" in ident:
                    continue
                if ident not in defs and ident[0].isupper():
                    print(f"WARN: {sf.relative_to(ROOT)} references `{ident}` — not found in this repo (may be external).")
                    warn_count += 1
    print(f"validate-skill-symbols: done ({warn_count} heuristic warnings).")
    sys.exit(0)


if __name__ == "__main__":
    main()
