---
name: simpl_api
description: |
  Use this skill whenever the user asks about the simpl FastAPI backend, API routes, customer/admin endpoints, agent endpoints, prompt templates, exports, webhooks, background jobs, or code that calls `simpl_api` service behavior. This is primarily an app/service repo, not a reusable library.
---

# simpl_api integration guide

> **Maintained by**: the `simpl_api` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_api/.agent/SKILL.md`

## What this service is

`simpl_api` is the FastAPI backend for the simpl sales intelligence platform. It exposes app/admin API routes, webhook handlers, guided/autopilot endpoints, prompt/template services, background jobs, and agent-facing backend workflows.

## Installation

```bash
conda env create -f environment.yml
conda activate simpl_api
poetry install
cp .env.example .env
```

This repo is normally deployed as a service, not installed as a dependency by other repos.

## Basic usage

```bash
conda activate simpl_api
poetry run uvicorn simpl_api.main:app --reload
```

When adding API behavior, place HTTP route code under `src/simpl_api/api`, reusable business logic in `simpl_core` or `src/simpl_api/services`, and schemas under `src/simpl_api/schemas`.

## Rules and conventions

- Keep FastAPI route handlers thin. Move reusable domain behavior to `simpl_core` or a service module.
- Use Pydantic schemas for request/response contracts.
- Keep environment variables documented in `README.md` and `.env.example` when adding new config.
- Use existing agent/service patterns before introducing a new orchestration style.
- Authenticate product routes with `auth.get_current_user`, which also refuses SimpL Challenge entrants; scope them with `simpl_api.guards`, whose `resolve_user_context` repeats that refusal against the database. Both are single places, so a new endpoint written against the ordinary dependencies inherits them. Do not reimplement either check per endpoint.

## Common pitfalls

- Do not duplicate shared logic already available in `simpl_core`.
- Do not add undocumented environment variables.
- Do not run real external provider calls in tests unless explicitly marked/configured.
- Do not give a challenge endpoint a product guard, or a product endpoint `require_challenge_participant`. The two contexts are separate types precisely so the substitution does not typecheck.

## Testing

No work in `simpl_api` should be considered complete until the full repo test suite has been run successfully. Targeted tests help during iteration, but they do not replace the final full-repo run. [per simpl-testing-policy]

```bash
conda activate simpl_api
poetry install
poetry run pytest
poetry run ruff check .
```

## What this service does NOT do

- Does not own reusable platform domain primitives. Put those in `simpl_core`.
- Does not own database ORM primitives. Use `simpl_orm`.
- Does not schedule long-running Prefect workflows. Use `simpl_flow`.
- Does not own frontend UI. Use `simpl_sales` or `simpl_dashboard`.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_api`
- App routes: `src/simpl_api/api`
- ROI admin: `src/simpl_api/api/v1/admin/roi.py` (domain in `simpl_core.roi`)
- ROI time survey (token, not JWT): `src/simpl_api/api/v1/roi_survey.py`
- Agent code: `src/simpl_api/agents`
- Internal conventions: `.agent/INTERNAL.md`
