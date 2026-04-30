---
name: coding-standards
description: simpl-wide coding conventions and style rules that apply to all our repositories. ALWAYS consult this skill when writing, refactoring, or reviewing any code in our codebase, even if the user doesn't explicitly mention standards. Use for questions about naming, formatting, project structure, imports, error handling, type hints, comments, documentation style, or "how do we write X at simpl".
---

# simpl coding standards

> **Auto-distributed via simpl-knowledge. Propose edits with a PR on `simpl-techs/simpl-knowledge`.**

## Languages and stacks

- **Backend**: Python 3.12+, FastAPI, Pydantic v2, async-first
- **Frontend**: TypeScript (strict mode), React 18, Vite
- **Data**: Postgres 16, SQLAlchemy 2.x (async), Alembic migrations
- **Infra**: Docker + docker-compose for local, Fly.io for prod

If a task requires a stack outside this list, stop and flag it to the human before proceeding.

## Naming

- **Python**: `snake_case` for functions/variables, `PascalCase` for classes, `SCREAMING_SNAKE` for module-level constants.
- **TypeScript**: `camelCase` for variables/functions, `PascalCase` for types/components, `kebab-case` for filenames (e.g. `user-profile.tsx`).
- **Event names, URLs, DB tables**: always `snake_case`.
- No abbreviations unless universally understood (`id`, `url`, `http` ok; `usr`, `cfg` not ok).

## Project structure conventions

Every service/library follows this layout:

```
<repo-name>/
├── .agent/                 ← agent-facing docs (SKILL.md, INTERNAL.md)
├── src/<repo_name>/        ← main package
├── tests/                  ← mirrors src/ layout
├── docs/                   ← human-facing docs
├── pyproject.toml or package.json
└── README.md
```

## Error handling

- Never swallow exceptions silently. If you catch, either re-raise or log structured.
- No bare `except:`. Always `except SpecificError as e:`.
- User-facing errors: return typed error responses, never leak stack traces in prod.

## Imports

- **Python**: absolute imports only from the package root (e.g. `from simpl_tracker.events import ...`), never relative imports across subpackages.
- **TypeScript**: use path aliases (`@/components/...`), never deep `../../../`.

## Comments

- Comments explain **why**, not **what**. The code shows what.
- TODO/FIXME must include an author and a ticket reference: `# TODO(alice, #123): extract to helper`.
- No commented-out code in committed diffs. Git has history.

## Commits

See `git-workflow` skill.

## Never

- Never add a new runtime dependency without asking the human first.
- Never write secrets or API keys in code, even placeholders like `"your-key-here"`.
- Never bypass existing abstractions (e.g. don't write raw SQL if the repository has an ORM layer).
- Never use `any` / `# type: ignore` without a short comment explaining why.

## When in doubt

Ask before implementing. A 30-second clarification saves a 30-minute revert.
