---
name: simpl_knowledge_system
description: Explains how simpl org shares agent context via simpl_knowledge (Claude Code marketplace + Cursor rules + optional simpl-memory). ALWAYS consult when the user asks how this setup works, what skills exist, how to update shared knowledge, where provenance is logged, how library SKILL.md syncs, or what simpl-memory instincts are.
---

# simpl_knowledge system

## Mental model

| Piece | Role |
|-------|------|
| `simpl-techs/simpl_knowledge` | Private marketplace: `simpl-standards`, `simpl-memory`, `simpl-libraries`, `<lib>-context` plugins |
| `catalog.md` / `catalog.json` | Repo root; auto-generated index of all `*-context` libs (summary, when to use, required_when). Updated on each library sync. |
| `.agent/SKILL.md` (per library) | Public integration doc; **source of truth** lives in the library repo |
| `.agent/INTERNAL.md` | Repo-local only; never synced to marketplace |
| `~/.claude/simpl-memory/` | Local instinct store (optional, see `plugins/simpl-memory/PRIVACY.md`) |
| `provenance.jsonl` | Append-only log of sync events (repo, sha, plugin version) |

## Claude Code

```text
/plugin marketplace add simpl-techs/simpl_knowledge
/plugin install simpl-standards@simpl
/plugin install simpl-memory@simpl
/plugin install simpl-libraries@simpl
/plugin install <lib>-context@simpl   # when task needs full integration SKILL
/plugin marketplace update           # weekly
```

## Cursor

- Rules ship as **`cursor-rules-rolling`** release zip (built from SKILL.md). Install via `scripts/team-bootstrap.sh` or `scripts/install-team.sh`.
- **Hooks (DRY with Claude Code)**: add new logic once under `simpl_knowledge/scripts/shared-hooks/<name>.js`. Register Cursor events in `.cursor/hooks.json` as `node …/adapter.js <name>`; register Claude hooks to call the same script. `session-refresh` + global `~/.cursor/hooks.json` merge is installed by those scripts so `sessionStart` stays in parity with Claude `SessionStart`.

## Update loop (library)

1. **New or drifting repo**: skill `repo-context-bootstrap` or `/bootstrap-repo-context` aligns the working copy with `library-repo-template/` after explicit user confirmation (never silent writes).
2. **Manual**: `/update-skill` before merge when public API changes.
3. **On merge**: push to `main` updates `.agent/SKILL.md` → `sync-skill-to-marketplace` opens PR on `simpl_knowledge`.
4. **Scheduled**: `auto-update-skill` may propose SKILL PRs (human must merge).

## Instincts (simpl-memory)

- **Stop** hook → extract patterns (provider matches session model) → `instincts.jsonl`.
- **SessionStart** → inject count ≥ 2; notify promotion at count ≥ 3.
- **Commands**: `/instinct-status`, `/promote-instinct`, `/dismiss-instinct`.
- **Never** auto-promote to shared skills without human review.

## Where to read more

- Humans: `docs/human/QUICKSTART.md`, `docs/human/ARCHITECTURE.md` in this repo.
- Agents (token-tight): `docs/agent/CONTEXT.md`, `docs/agent/SKILL_AUTHORING.md`.
- Recent sync lines: `references/CHANGES.md` (this skill).

## Rules for you (agent)

- If unsure whether something is org-wide vs library-specific, ask once; default library-local (`.agent/SKILL.md`).
- Cite `provenance.jsonl` or `references/CHANGES.md` when the user asks what changed recently in shared knowledge.
- Do not paste secrets into skills or instincts; redaction is best-effort only.
