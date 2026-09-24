#!/usr/bin/env bash
# SKILL.md under plugins/ → Cursor .mdc under cursor-rules/ (zip + release in CI).
# Fails without writing when two skills map to one .mdc (see cursor_rule_names.py).

set -euo pipefail

python3 - "$(cd "$(dirname "$0")" && pwd)" <<'PY'
import pathlib, shutil, sys

sys.dont_write_bytecode = True  # keep scripts/__pycache__ out of the checkout
sys.path.insert(0, sys.argv[1])
from cursor_rule_names import collisions, skill_rules, split_frontmatter

rules = skill_rules(pathlib.Path("."))
clashes = collisions(rules)
if clashes:
    # Fail before touching cursor-rules/: overwriting would ship whichever skill came last.
    print("generate-cursor-rules FAILED: two skills map to the same Cursor rule", file=sys.stderr)
    for clash in clashes:
        print(f"  - {clash}", file=sys.stderr)
    sys.exit(1)

import yaml  # only the writer needs it; the check above is stdlib-only

out = pathlib.Path("cursor-rules")
shutil.rmtree(out, ignore_errors=True)
out.mkdir()

# Standards + org meta-skill: always on in Cursor.
ALWAYS_APPLY = {
    "coding-standards",
    "git-workflow",
    "testing-policy",
    "simpl_knowledge_system",
    "internal-libraries-awareness",
    "agent-disclosure",
    "architecture-discipline",
    "state-and-persistence",
    "data-flow-discipline",
    "doppler",
}

for skill, name, base in rules:
    source_fm, body = split_frontmatter(skill.read_text(encoding="utf-8"))
    fm = yaml.safe_load(source_fm)

    description = (fm.get("description") or "").strip()
    if isinstance(description, str):
        desc_short = description[:200]
    else:
        desc_short = str(description)[:200]

    if name in ALWAYS_APPLY:
        mdc_frontmatter = {
            "description": desc_short,
            "globs": "**/*",
            "alwaysApply": True,
        }
    else:
        cg = fm.get("cursor_globs")
        globs = (cg.strip() if isinstance(cg, str) else None) or "**/*.py,**/*.ts,**/*.tsx,**/*.js"
        mdc_frontmatter = {
            "description": desc_short,
            "globs": globs,
            "alwaysApply": False,
        }

    fm_text = "---\n"
    for k, v in mdc_frontmatter.items():
        if isinstance(v, bool):
            fm_text += f"{k}: {str(v).lower()}\n"
        else:
            fm_text += f'{k}: "{v}"\n'
    fm_text += "---\n\n"

    mdc_path = out / base
    mdc_path.write_text(fm_text + body, encoding="utf-8")
    print(f"  generated {mdc_path}")

print("Done.")
PY
