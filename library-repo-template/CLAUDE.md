# CLAUDE.md

> Lean by design. Most project context lives in `.agent/SKILL.md` (public) and `.agent/INTERNAL.md` (internal), loaded on-demand via skills.

## Repo identity

- **Name**: REPLACE-ME
- **Purpose**: One sentence — what this repo does.
- **Stack**: REPLACE-ME (e.g. Python 3.12, FastAPI)

## Where to find what

- **Working on this repo**: read `.agent/INTERNAL.md` for conventions specific to this codebase.
- **Integrating this repo from elsewhere**: read `.agent/SKILL.md` — it is also published to the `simpl-techs/simpl_knowledge` marketplace (`*-context` plugin).
- **simpl-wide conventions** (commits, testing, code style): `simpl-standards`. **Internal library catalog** (`catalog.md`): `simpl-libraries`. If missing, run `/plugin install simpl-standards@simpl` and `/plugin install simpl-libraries@simpl`.

## Session conventions

- Branch off `main`. Use `feat/`, `fix/`, `chore/` prefixes.
- Conventional Commits for commit messages. See `git-workflow` skill.
- Run `make check` before pushing.

## Before finishing a session

If you modified the public surface (anything exported from `src/<package>/__init__.py` or `src/<package>/api.py`), run `/update-skill` to refresh `.agent/SKILL.md` and include the diff in the same PR.
