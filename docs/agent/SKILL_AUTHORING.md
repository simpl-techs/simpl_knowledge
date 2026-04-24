---
name: simpl-skill-authoring
description: House rules for writing SKILL.md files for simpl. Use when drafting or editing any SKILL.md under plugins/ or when helping a human write .agent/SKILL.md for a library.
---

# SKILL authoring (simpl)

1. **Frontmatter `description`**: 40+ chars; list *when* to load + paraphrases users say; name the library explicitly.
2. **Optional `cursor_globs`**: For integration skills only — narrow Cursor globs (e.g. `**/*.py,**/*tracker*`).
3. **Body sections**: one-line identity → install → 90% example → strict rules → pitfalls → testing → **does NOT do** → pointers.
4. **Length**: ≤400 body lines; split detail to `.agent/references/` in the library repo if needed.
5. **Truth**: No APIs you cannot verify from source in that repo.
6. **Promotion**: Instincts → reviewed text in SKILL or `simpl-standards`; never raw instinct JSON in marketplace.

Full historical narrative: `docs/history/SKILL_WRITING_GUIDE.md`.
