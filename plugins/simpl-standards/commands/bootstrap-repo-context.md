---
name: bootstrap-repo-context
description: Check and align the current repo with simpl-knowledge library-repo-template (dry-run by default). Use when onboarding a library repo to simpl-knowledge or after template updates.
---

# /bootstrap-repo-context

Same workflow as the `repo-context-bootstrap` skill: read `.claude/.simpl-repo-report.json`, or run `repo-context-check.js --print` (add `--skip-gate` only if the user confirmed a cold repo).

1. `node ~/.claude/plugins/cache/simpl-knowledge/scripts/shared-hooks/repo-context-check.js --print`
2. Show drift; ask confirmation.
3. `node .../apply-repo-template.js` then `node .../apply-repo-template.js --write`
4. `git diff` — suggest `chore(agent): bootstrap simpl-knowledge repo context`

Never `--write` without explicit user approval.
