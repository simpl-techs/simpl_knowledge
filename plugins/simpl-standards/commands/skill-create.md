---
name: skill-create
description: Generate a first-draft `.agent/SKILL.md` for a library repo by analyzing its git history, public API, and integration examples. Use when starting to onboard a repo to simpl-knowledge.
---

# /skill-create

Bootstrap a SKILL.md from scratch for the current repository. Use this once, when a library is new to the marketplace. For ongoing maintenance, use `/update-skill` instead.

## Process

1. **Detect the repo shape**:
   ```bash
   pwd
   ls -la
   find . -maxdepth 2 -name "pyproject.toml" -o -name "package.json" -o -name "Cargo.toml" -o -name "go.mod"
   ```
   Identify: language, framework, likely public surface.

2. **Find the public API**:
   - Python: `src/<pkg>/__init__.py`, `src/<pkg>/api.py`, anything exported via `__all__`
   - TypeScript: `src/index.ts`, named exports in `package.json`'s `exports` field
   - Go: exported types/functions in top-level package
   - Rust: `lib.rs` public items

   Read these files. They define what this skill is about.

3. **Look at how the library is used elsewhere** (if possible):
   ```bash
   # If the org has a grep-able structure:
   # grep -r "from <package> import\|require('<package>')\|from \"<package>\"" ~/path/to/other-repos/
   ```
   Real call sites are gold — they show the actual 90% case to document.

4. **Mine git history for signal**:
   ```bash
   # Commits that mention "BREAKING", "deprecated", "security", "fix"
   git log --grep="BREAKING\|breaking\|deprecated\|security" --oneline -30
   # Files most changed (high-churn = public surface that evolves)
   git log --since='6 months ago' --pretty=format:'' --name-only | sort | uniq -c | sort -rn | head -10
   ```

5. **Draft the SKILL.md** following the house template. Fill in:
   - **`description` frontmatter**: list 4-6 paraphrases the user might use ("track events", "log analytics", etc.). This is 70% of the work — spend time here.
   - **One-line identity**: what this library IS, not what it does
   - **Installation snippet** from the manifest
   - **The 90% case**: one code example, minimal, realistic. Derived from actual usage you found in step 3.
   - **Rules section**: only rules you can VERIFY from code (naming conventions from the source, invariants from tests)
   - **Common pitfalls**: extracted from git log comments, PR descriptions, issue tracker if accessible
   - **"Does NOT do" section**: what this library is explicitly not for — use the existence of sibling libs as hints
   - **Owner**: ask the user who to attribute

6. **Write the file** to `.agent/SKILL.md`. Also initialize `.agent/INTERNAL.md` from the template if missing.

7. **NEVER invent**: every API mentioned must exist in the source you read. Better a shorter truthful draft than a complete hallucination.

8. **End with a review step**: show the user the drafted file, explicitly ask "anything I got wrong or should add?", iterate until they're satisfied before committing.

9. **Commit** (when user confirms):
   ```bash
   git add .agent/
   git commit -m "docs(agent): bootstrap SKILL.md for marketplace"
   ```
   The sync workflow will pick it up on merge to main.

## Do not

- Do not write long prose. Imperative, concrete, code-heavy.
- Do not exceed 400 lines.
- Do not copy content from other libraries' SKILL.md. Each is domain-specific.
- Do not generate the skill if the repo has <5 commits — the signal is too weak. Ask the user to write the first version manually.
