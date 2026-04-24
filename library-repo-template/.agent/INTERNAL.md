---
name: REPO-NAME-internal
description: Internal conventions for working on the REPO-NAME codebase itself. Use ONLY when editing, refactoring, debugging, testing, or reviewing code inside this repository — NOT when consuming this library from another project. Triggers when the current working directory is this repo and the user asks about architecture, testing approach, refactoring, adding features here, or any work that modifies this repo's source.
cursor_globs: "src/**/*,tests/**/*"
---

# REPO-NAME — internal conventions

> This is for when you're working *inside* this repo.
> If you're integrating this library from elsewhere, read `SKILL.md` instead.

## Architecture in 30 seconds

Brief description of the internal structure. Not marketing — just the mental model.

```
src/repo_name/
├── api.py          ← public entry points (exported in __init__.py)
├── core/           ← core logic, no I/O
├── adapters/       ← I/O boundaries (HTTP, DB, queue)
└── testing.py      ← public test utilities (MockX, factories)
```

## Public vs internal surface

- Anything in `api.py` and `__init__.py` is **public** — renaming or removing is a breaking change, bumps MAJOR version, requires updating `.agent/SKILL.md`.
- Anything in `core/`, `adapters/` is **internal** — free to refactor without notice.

## Invariants

Things that must always be true. If you're about to break one, stop and ask first.

- Invariant 1 (e.g. "Tracker is thread-safe — never use module-level mutable state")
- Invariant 2 (e.g. "All events are serialized by the `EventEncoder` class, nowhere else")

## How we test

- Unit tests in `tests/unit/` — fast, no I/O
- Integration tests in `tests/integration/` — hit a real local DB/queue via docker-compose
- Run: `make test` (unit) or `make test-all` (unit + integration)

## Local development

```bash
# First-time setup
make install

# Run the service locally
make dev

# Run the full check before pushing
make check   # lint + type + unit tests
```

## Release process

1. Update `CHANGELOG.md` under `[Unreleased]` → rename to `[x.y.z]`
2. Bump version in `pyproject.toml` / `package.json`
3. Tag: `git tag vX.Y.Z && git push --tags`
4. GitHub Action `release.yml` builds and publishes

## Things the agent should NEVER do here

- Never add a dependency without asking
- Never delete `testing.py` exports — external consumers use them
- Never change the event schema without a migration plan
- Never commit directly to `main`

## Open questions / known tech debt

Track these explicitly so the agent doesn't helpfully "fix" them mid-PR:

- [Known issue 1 and why it's not fixed yet]
- [Pending decision 2 and the Slack thread]
