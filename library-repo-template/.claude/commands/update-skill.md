---
name: update-skill
description: Update .agent/SKILL.md based on the work just done in this session or on this branch.
---

# /update-skill

The dev just finished meaningful work that may have changed how other teammates (or their agents) need to use this library. Update `.agent/SKILL.md` accordingly.

Your task:

1. **Read `.agent/SKILL.md`** as the current state.

2. **Read `.agent/INTERNAL.md`** to understand what's considered public vs internal.

3. **Look at what changed recently**:
   - Run `git diff origin/main...HEAD --stat` to see the files touched
   - Run `git diff origin/main...HEAD -- <public-surface files>` for the public API files
   - Read the actual diffs, don't just look at filenames

4. **Classify the changes**:
   - Public API changed (added / removed / renamed function, class, endpoint, event type)?
   - Installation or initialization changed?
   - A new pattern became the recommended way?
   - A new pitfall emerged (based on the PR description, commit messages, or your recollection of this session)?

5. **Only if there's something substantive**, update `.agent/SKILL.md` to reflect the new reality. If nothing public changed, say so and do nothing.

6. **Never invent**: verify every API you document by opening the actual source file. Do not document things that don't exist yet.

7. **Preserve style**: imperative voice, concrete examples, "what this does NOT do" section, pitfalls section. Keep under 400 lines.

8. **Print a summary** of what you changed (or "nothing to update") so the dev can review it before including in the PR.

9. If you edited `.agent/INTERNAL.md` or changed internal-only conventions, run:
   ```bash
   bash .claude/hooks/sync-cursor-internal.sh
   ```
   This regenerates `.cursor/rules/repo-internal.mdc` for Cursor (no manual drift).

After running this, the dev should visually diff `.agent/SKILL.md` and include it in the same PR as the code change. That way the sync workflow picks it up automatically when the PR merges.
