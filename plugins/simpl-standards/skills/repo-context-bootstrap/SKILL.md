---
name: repo-context-bootstrap
description: |
  Use when the current git repo should follow simpl-knowledge library-repo-template but is missing files, has placeholders, or org-owned files are outdated vs the template. Triggers when .claude/.simpl-repo-report.json shows drift, the user asks to "bootstrap agent context", "align this repo to simpl", "set up marketplace sync", or you see simpl-knowledge SessionStart drift hints. For repos with no .agent/ yet, run the check with --skip-gate after the user confirms they want this repo on simpl-knowledge. NEVER apply changes without explicit user confirmation.
---

# repo-context-bootstrap

## Paths

- Shared scripts: `~/.claude/plugins/cache/simpl-knowledge/scripts/shared-hooks/` (same tree under a cloned `simpl-knowledge` repo).
- Template: `~/.claude/plugins/cache/simpl-knowledge/library-repo-template/`

## 1. Read drift signal

1. If `.claude/.simpl-repo-report.json` exists, read `items` and list every entry where `status` is not `aligned`.
2. If missing or stale, run (from repo root):

```bash
node ~/.claude/plugins/cache/simpl-knowledge/scripts/shared-hooks/repo-context-check.js --print
```

3. To analyze a repo that is not yet opted in (no `.agent/` / `CLAUDE.md` / etc.), only after the user confirms:

```bash
node ~/.claude/plugins/cache/simpl-knowledge/scripts/shared-hooks/repo-context-check.js --print --skip-gate
```

## 2. Explain impact (no emojis)

- **Org-owned** files (workflows, hook shims, `sanitize-commit-digest.py`, Cursor adapter under `.cursor/hooks/`, `repo-internal.mdc` placeholder): safe to refresh from template.
- **Repo-owned** files (`.agent/*`, `CLAUDE.md`, `.claude/settings.json`, `.cursor/hooks.json`): only created or replaced when **missing** or still containing template placeholders. If `outdated` with real content, **do not overwrite** — tell the user to edit manually or use `/update-skill` / `/skill-create`.

## 3. Confirm

Ask once: proceed with template apply? If no, stop.

## 4. Dry-run then apply

```bash
node ~/.claude/plugins/cache/simpl-knowledge/scripts/shared-hooks/apply-repo-template.js
node ~/.claude/plugins/cache/simpl-knowledge/scripts/shared-hooks/apply-repo-template.js --write
```

After `--write`: show `git status` and `git diff --stat`, suggest commit message `chore(agent): bootstrap simpl-knowledge repo context`.

## 5. Fill remaining placeholders

If `.agent/SKILL.md` or `CLAUDE.md` still contain `REPLACE-ME` / `REPO-NAME`, use `/skill-create` or manual edit before merging.

## Rules

- Do not invent APIs or owners; only template-backed files are automated.
- If `repo-context-check` reports `no_cache` / `no_template_dir`, tell the user to run `team-bootstrap.sh` and add the marketplace first.
