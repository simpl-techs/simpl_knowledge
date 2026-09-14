---
name: simpl_knowledge_system
description: Explains how simpl org shares agent context via simpl_knowledge (Claude Code marketplace + Cursor rules + Codex skills + optional simpl-memory). ALWAYS consult when the user asks how this setup works, what skills exist, how to update shared knowledge, where provenance is logged, how library SKILL.md syncs, or what simpl-memory instincts are.
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
bash scripts/team-bootstrap.sh
# optional, when a task needs a full library SKILL:
# /plugin install <lib>-context@simpl
```

- **Auto-heal**: `simpl-standards` SessionStart runs `plugin-refresh.js` — `fetch` + `reset --hard` on `~/.claude/plugins/marketplaces/simpl`, then `claude plugin update` when installed versions lag `marketplace.json`. New versions load next session.

## Cursor

- **Shared Git cache**: `~/.simpl_knowledge/cache`, outside Claude's plugin cache garbage collection. Bootstrap migrates legacy `~/.claude/plugins/cache/simpl_knowledge` into a backup and relinks Codex skills. Do not put a shared repository inside a harness-owned plugin cache.

- Rules ship as **`cursor-rules-rolling`** release zip (built from SKILL.md; includes `.version` stamp). Install via `scripts/team-bootstrap.sh` or `scripts/install-team.sh`.
- **Hooks (DRY with Claude Code)**: add new logic once under `simpl_knowledge/scripts/shared-hooks/<name>.js`. Register Cursor events in `.cursor/hooks.json` **under `hooks` as arrays** (`node …/adapter.js <name>`). Global `sessionStart` → `session-refresh` is merged by `install-cursor-global-hooks.sh` (also copies `shared-hooks` to `~/.cursor/hooks/shared-hooks/`).
- **Hook self-update**: `session-refresh` re-copies `shared-hooks/*.js` and `adapter.js` from the cache each run, so changed hook code reaches a machine without re-running the bootstrap (active from the next session). Registering a *new event* still needs `install-cursor-global-hooks.sh`.
- **Auto-refresh**: each new Cursor chat runs `session-refresh` (fetch + `reset --hard` on the git cache, sync `simpl-*.mdc`, sync Codex skills, write `~/.simpl_knowledge/state.json`, inject `additional_context` with the active sha). Diagnose with `bash scripts/doctor.sh`.

## Codex

- Skills: every `plugins/*/skills/<name>` in the cache is symlinked into `~/.agents/skills` and `~/.codex/skills` (both Codex global skill dirs), so Codex sees the org standards *and* every `<lib>-context` skill without a plugin install.
- Instructions: `~/.codex/AGENTS.md` holds a block between `<!-- simpl_knowledge:start -->` / `:end` markers listing the always-on skills. Text outside the markers is the developer's own and is never touched.
- Wiring: `sync-codex-knowledge.js` (shared hook) runs from `team-bootstrap.sh` / `install-team.sh` and again from every `session-refresh`. Because skills are symlinks, a cache refresh updates their content with no re-link.
- The always-on list is derived from `cursor-rules/*.mdc` frontmatter (`alwaysApply: true`) — one source of truth across the three harnesses.

## Update loop (library)

1. **New or drifting repo**: skill `repo-context-bootstrap` or `/bootstrap-repo-context` aligns the working copy with `library-repo-template/` after explicit user confirmation (never silent writes).
2. **Manual**: `/update-skill` before merge when public API changes.
3. **On merge**: push to `main` updates `.agent/SKILL.md` → `sync-skill-to-marketplace` opens PR on `simpl_knowledge`.
4. **Scheduled**: `auto-update-skill` may propose SKILL PRs (human must merge).

## Instincts (simpl-memory)

- **Owners** (`config/simpl.json` → `simpl_memory.instinct_owners`) run `/extract-instincts` on demand → local `instincts.jsonl` (uses the current IDE session; no plugin HTTP).
- **SessionStart** hook → inject patterns (count ≥ 2) + optional promotion notice (count ≥ 3).
- **Commands**: `/extract-instincts`, `/share-instincts`, `/aggregate-team-instincts`, `/instinct-status`, `/promote-instinct`, `/dismiss-instinct`.
- **Never** auto-promote to shared skills without human review.

## Where to read more

- Humans: `docs/human/QUICKSTART.md`, `docs/human/ARCHITECTURE.md` in this repo.
- Agents (token-tight): `docs/agent/CONTEXT.md`, `docs/agent/SKILL_AUTHORING.md`.
- Recent sync lines: `references/CHANGES.md` (this skill).

## Rules for you (agent)

- If unsure whether something is org-wide vs library-specific, ask once; default library-local (`.agent/SKILL.md`).
- Cite `provenance.jsonl` or `references/CHANGES.md` when the user asks what changed recently in shared knowledge.
- Do not paste secrets into skills or instincts; redaction is best-effort only.
