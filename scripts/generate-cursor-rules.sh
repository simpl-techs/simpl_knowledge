#!/usr/bin/env bash
# SKILL.md under plugins/ → Cursor .mdc under cursor-rules/ (zip + release in CI).

set -euo pipefail

OUT_DIR="cursor-rules"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

python3 <<'PY'
import pathlib, re, yaml

out = pathlib.Path("cursor-rules")
out.mkdir(exist_ok=True)

# Standards + org meta-skill: always on in Cursor.
ALWAYS_APPLY = {
    "coding-standards",
    "git-workflow",
    "testing-policy",
    "simpl-knowledge-system",
}

for skill in pathlib.Path("plugins").rglob("SKILL.md"):
    text = skill.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
    if not m:
        continue
    fm = yaml.safe_load(m.group(1))
    body = m.group(2)

    name = fm.get("name", skill.parent.name)
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

    # Prefix simpl- so session-refresh can overwrite only org-managed rules in ~/.cursor/rules.
    base = f"{name}.mdc" if str(name).startswith("simpl-") else f"simpl-{name}.mdc"
    mdc_path = out / base
    mdc_path.write_text(fm_text + body, encoding="utf-8")
    print(f"  generated {mdc_path}")

print("Done.")
PY
