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
7. **Density**: every line costs tokens in each session that opens the skill, and Cursor sends always-apply skills with every request. One rule per bullet, imperative, short sentences. Cut filler ("Note that", "It is important to"), rules said twice (a "Don't" list or a table repeating the body), and checklists for what CI already enforces. Keep the why of non-obvious rules in one clause (it lets an agent handle cases the rule does not name), exact commands, paths, names and numbers, and one example where a format is ambiguous. Keep normal grammar: agents copy the register they read into commits and docs.
8. **Nothing hidden**: detail moves to `references/<topic>.md` only when it is rarely needed, with a pointer in SKILL.md saying when to open it. Cursor gets only the SKILL.md body, so the pointer also gives `~/.simpl_knowledge/cache/plugins/<plugin>/skills/<skill>/references/`.
9. **Shortening keeps meaning**: list every rule of the old version and check each one survives; report contradictions instead of fixing them in the same commit.

Full historical narrative: `docs/history/SKILL_WRITING_GUIDE.md`.
