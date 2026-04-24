---
name: simpl-knowledge-agent-context
description: Token-efficient reference for agents about simpl-knowledge. Read when answering questions about org-wide agent setup, marketplace simpl/simpl-knowledge, plugin names simpl-standards and simpl-memory, Cursor rolling release cursor-rules-rolling, or provenance.jsonl.
---

# simpl-knowledge — agent context

- **Marketplace alias**: `simpl` (`@simpl` in `/plugin install`).
- **Plugins**: `simpl-standards` (always), `simpl-memory` (optional API), `<repo>-context` (per library).
- **Truth**: Library integration text lives in **that library’s** `.agent/SKILL.md`; `simpl-knowledge` mirrors it under `plugins/<repo>-context/`.
- **Cursor**: Consume `cursor-rules.zip` from release tag `cursor-rules-rolling` (not the git tree).
- **Memory path**: `~/.claude/simpl-memory/<repo>/instincts.jsonl`.
- **Meta skill**: `simpl-knowledge-system` — explain full loop to users.
- **Human docs** (longer): `docs/human/*.md` (Italian, onboarding).

## Bootstrap detection (library repos)

- Template lives in marketplace clone: `library-repo-template/` under `simpl-knowledge` cache.
- `repo-context-check.js` compares tracked files vs template (opt-in gate). Drift → `.claude/.simpl-repo-report.json` (gitignored) and Claude SessionStart may surface a hint.
- Apply only after user says yes: `apply-repo-template.js` (dry-run default) or skill `repo-context-bootstrap` / `/bootstrap-repo-context`.
