"""Name the Cursor rule each plugins/**/SKILL.md becomes, and catch two skills claiming one.

generate-cursor-rules.sh writes cursor-rules/<base>.mdc per skill; ci/validate-agent-infra.sh
runs the same collision check so a PR or library sync can never reach main with two skills
overwriting one rule. Standard library only: library-repo sync runners have no PyYAML.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import NamedTuple

FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n(.*)", re.DOTALL)
# Top-level key only: nested maps and block-scalar lines are indented.
NAME = re.compile(r"^name:[ \t]*(.*?)[ \t]*$", re.MULTILINE)


class SkillRule(NamedTuple):
    skill: Path  # relative to the repo root
    name: str
    base: str  # file name under cursor-rules/


def split_frontmatter(text: str) -> tuple[str, str] | None:
    """(frontmatter, body), or None when the SKILL.md has no frontmatter and gets no rule."""
    m = FRONTMATTER.match(text)
    return (m.group(1), m.group(2)) if m else None


def rule_basename(name: str) -> str:
    # Prefix simpl- so session-refresh can overwrite only org-managed rules in ~/.cursor/rules.
    if name.startswith("simpl-"):
        return f"{name}.mdc"
    if name.startswith("simpl_"):
        return f"{name.replace('_', '-')}.mdc"
    return f"simpl-{name}.mdc"


def skill_rules(root: Path) -> list[SkillRule]:
    """Every SKILL.md under root/plugins that becomes a rule, in sorted path order."""
    rules = []
    for skill in sorted((root / "plugins").rglob("SKILL.md")):
        parts = split_frontmatter(skill.read_text(encoding="utf-8"))
        if not parts:
            continue
        m = NAME.search(parts[0])
        name = (m.group(1).strip("\"'") if m else "") or skill.parent.name
        rules.append(SkillRule(skill.relative_to(root), name, rule_basename(name)))
    return rules


def collisions(rules: list[SkillRule]) -> list[str]:
    """One message per cursor-rules/<base> that more than one SKILL.md would write."""
    claims: dict[str, list[Path]] = {}
    for rule in rules:
        claims.setdefault(rule.base, []).append(rule.skill)
    return [
        f"cursor-rules/{base} would be written by {', '.join(map(str, skills))}"
        " (last writer wins): rename one frontmatter name or delete the stale copy"
        for base, skills in sorted(claims.items())
        if len(skills) > 1
    ]
