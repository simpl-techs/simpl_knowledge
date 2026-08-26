---
name: coding-standards
description: simpl-wide coding conventions, style rules, and the engineering-principles HUB. ALWAYS consult this skill when writing, refactoring, or reviewing any code in our codebase, even if the user doesn't explicitly mention standards. Covers naming, formatting, project structure, imports, error handling, type hints, comments, documentation style, and "how do we write X at simpl". Also acts as the routing hub pointing to deeper standards skills (architecture-discipline, state-and-persistence, data-flow-discipline, testing-policy, doppler).
---

# simpl coding standards

> **Auto-distributed via simpl_knowledge. Propose edits with a PR on `simpl-techs/simpl_knowledge`.**

This skill is the **always-on hub**. It carries the universal engineering principles every contributor follows, plus a routing table to the deeper, scoped standards skills. Open the deep skill named here when you cross into its territory.

## Languages and stacks

- **Backend**: Python 3.12+, FastAPI, Pydantic v2, async-first
- **Frontend**: TypeScript (strict mode), React 18, Vite
- **Data**: Postgres 16, SQLAlchemy 2.x (async), Alembic migrations
- **Infra**: Docker + docker-compose for local, Fly.io for prod

If a task requires a stack outside this list, stop and flag it to the human before proceeding.

## Engineering principles (universal)

These principles apply to every piece of code at simpl. They sit above style and above any single deep skill.

- **Prefer SOLID** wherever it applies. Bias toward small, single-purpose units; depend on abstractions when a second consumer is plausible.
- **No defensive code.** Trust internal callers and framework guarantees. Validate only at system boundaries (HTTP input, external APIs, untrusted IO). Do not add error handling, fallbacks, or null checks for cases that cannot happen — they hide bugs and inflate surface area.
- **Errors are loud, not silent.** Important exceptions must be raised with full traceback and enough context to diagnose. Minor errors *may* be caught — but you **must** emit at least a structured warning log with the entity id, the operation, and the cause, and keep that record somewhere a human can find it later. A `try/except` that ends in `pass` or a `return None` is a bug.
- **Search before writing.** Before adding any new function, model, utility, repository, service, or integration: check what already exists, both in this repo *and* across the simpl org. If something similar exists, reuse or extend it. Never duplicate. Use `internal-libraries-awareness` to scan the catalog; use the host's grep/find for in-repo searches.
- **Read the rules before deciding.** Before making non-trivial choices (where to put a service, how to claim work, how to structure a pipeline), open the relevant simpl-standards / simpl-libraries skill that owns the topic. The routing table below tells you which one.
- **Architecture is for the whole system.** Every architectural choice (new module, new service, new schema, new pipeline) must be **scalable, extensible, flexible**, and aware of compute and DB cost on large data volumes. Greenfield code that ignores how the rest of the org runs is rework waiting to happen.
- **Operations are simple, linear, atomic.** Prefer small operations with one job. They compose, retry, and reuse cleanly. Avoid "do everything for this entity" methods that fetch, branch on rules, mutate multiple tables, and emit events in one body — they can only ever be called from one place and are nearly impossible to compose.

## When to open which deep skill (routing table)

The hub never duplicates the deep skills — it points to them. Open the matching skill **before** acting in its territory:

| Territory | Deep skill |
|---|---|
| Where code lives (packages, modules, layers), single source of truth, command/query separation, reusability, file size, imports hygiene, dependency direction, API surface, versioning | `architecture-discipline` |
| State machines, status fields, idempotency, DB sessions/transactions/locking, queue-style claims, async/IO discipline, bounded retries/timeouts/concurrency, observability | `state-and-persistence` |
| Threading typed data through layers (no re-extracting from rendered output), single-source state resolution, validation layering, DTO/output invariants, failure surfacing vs silent no-op, fixture/PII data | `data-flow-discipline` |
| Writing or reviewing tests | `testing-policy` |
| Anything that could already be an internal simpl library | `internal-libraries-awareness` |
| Python env, dependencies, running tests | `python-environment` |
| Secrets, `.env`, Doppler, Cloud Run / Vercel / Prefect env | `doppler` |
| Branches, commits, PRs | `git-workflow` |

If a decision spans more than one territory (it usually does), open all relevant skills before committing to an approach.

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

- Never swallow exceptions silently. If you catch, either re-raise or log structured (warning or error, with entity id + operation).
- No bare `except:`. Always `except SpecificError as e:`.
- User-facing errors: return typed error responses, never leak stack traces in prod.
- See `data-flow-discipline` → *Failure surfacing* for the rule on escalating internal failures instead of silent no-ops.

## Imports

- **Python**: absolute imports only from the package root (e.g. `from simpl_tracker.events import ...`), never relative imports across subpackages.
- **TypeScript**: use path aliases (`@/components/...`), never deep `../../../`.
- Deeper rules (no re-export shims, canonical-module imports, `TYPE_CHECKING` policy) live in `architecture-discipline` → *Imports and module hygiene*.

## Build verification (TS/JS)

A TS/JS implementation is **not done** until the build succeeds. Before declaring a task complete, the agent MUST run, in any repo whose `package.json` defines them:

- `npm run build` — must exit 0. A failing build is a failing implementation, full stop.
- `npm run typecheck` (or `tsc --noEmit` if no typecheck script) — must exit 0 when the repo is TypeScript.
- `npm run lint` — must exit 0 if the script exists.

Rules:

- Run from the package root the change touches (monorepo: the affected workspace, not just the repo root).
- Use the repo's package manager (`pnpm`, `yarn`, or `npm`) — don't switch.
- Do not "fix" failures by deleting/silencing checks (`// @ts-ignore`, disabling rules, removing tests). Fix the underlying issue or stop and flag it to the human.
- If a script is missing in a repo where it should exist, flag it instead of silently skipping verification.
- Errors and warnings that the build surfaces are part of the implementation; treat them like a failed test.

Pure-Python repos and repos without `package.json` are unaffected.

## Comments

- Comments explain **why**, not **what**. The code shows what.
- TODO/FIXME must include an author and a ticket reference: `# TODO(alice, #123): extract to helper`.
- No commented-out code in committed diffs. Git has history.

## Commits

See `git-workflow` skill.

## Never

- Never add a new runtime dependency without asking the human first.
- Never write secrets or API keys in code, even placeholders like `"your-key-here"`.
- Never commit `.env`. Never tell a developer to run `doppler login` — see `doppler`.
- Never bypass existing abstractions (e.g. don't write raw SQL if the repository has an ORM layer).
- Never use `any` / `# type: ignore` without a short comment explaining why.
- Never duplicate code that already lives in the org — see `internal-libraries-awareness`.

## When in doubt

Ask before implementing. A 30-second clarification saves a 30-minute revert.
