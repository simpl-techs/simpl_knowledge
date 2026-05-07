# Agent context for this repo

This repo participates in **simpl_knowledge**. Two conventions matter:

## `.agent/SKILL.md`

Public-facing doc for *other* teammates' AI agents. Tells them how to use this library from elsewhere. Auto-synced to `simpl-techs/simpl_knowledge` on every merge to `main`.

Edit freely — the sync is automatic. If you're unsure what to write, see `simpl_knowledge/docs/history/SKILL_WRITING_GUIDE.md`.

## `.agent/INTERNAL.md`

Internal-only conventions for working *inside* this repo. Stays local, never synced anywhere.

---

## The loop

1. You do some work on a branch.
2. Before opening the PR, run `/update-skill` inside Claude Code — it will read your diff and update `.agent/SKILL.md` if the public surface changed.
3. You review the updated `.agent/SKILL.md` diff in your PR, same as any other file.
4. On merge to `main`:
   - `sync-skill-to-marketplace.yml` opens a PR in the marketplace with the new SKILL.md.
   - That PR is reviewed (usually a formality) and merged.
   - Teammates' agents see the new version on next `/plugin marketplace update`.

## Weekly safety net

Every Monday, `auto-update-skill.yml` runs **aider** (DeepSeek) against the last week of commits. If `.agent/SKILL.md` has drifted from reality, a PR is opened here with a proposed fix, labeled `needs-review`.

The workflow installs `aider` into a **`python3 -m venv .venv`** (`requirements-agent-ci.txt`; `.venv/` is gitignored — same layout you can use locally to debug `aider`).

Someone on the team reviews it — usually takes 5-10 minutes — and merges or closes.

## Secrets required in this repo

- `DEEPSEEK_API_KEY` — for the `auto-update-skill` workflow (aider + DeepSeek). Set at org level, inherited here.
- `SIMPL_KNOWLEDGE_PAT` — Personal Access Token with `repo` scope on `simpl_knowledge`. Also org-level.

## Extending

Add more hooks in `.claude/settings.json` for this repo only (e.g. auto-run tests after edits). They don't propagate to other repos.

Add more slash commands in `.claude/commands/` for repeatable per-repo workflows.

Org-wide stuff doesn't go here — it goes in `simpl_knowledge/plugins/simpl-standards/`.
