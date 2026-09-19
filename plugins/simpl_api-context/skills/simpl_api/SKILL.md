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
- Emails a user's SimpL agent sends go through the `email` channel plugin and `services/channels/agent_email.py`: a plain email in the agent's words, one link into SimpL, signed as the user's own agent persona. Pass `brain.notify_user` a `body` (and optionally `subject`, `route`); don't build HTML.
- Authenticate product routes with `auth.get_current_user`, which also refuses SimpL Challenge entrants; scope them with `simpl_api.guards`, whose `resolve_user_context` repeats that refusal against the database. Both are single places, so a new endpoint written against the ordinary dependencies inherits them. Do not reimplement either check per endpoint.

## Common pitfalls

- Do not duplicate shared logic already available in `simpl_core`.
- Do not add undocumented environment variables.
- Do not run real external provider calls in tests unless explicitly marked/configured.
- Do not give a challenge endpoint a product guard, or a product endpoint `require_challenge_participant`. The two contexts are separate types precisely so the substitution does not typecheck.

## Operational alerts

- `simpl_api.startup.agent_framework_failed` posts to Discord #error when the agent framework wiring fails at startup. The deploy does not come up.
- Agent framework failures reach #warning once. Chat alerts carry `user_id`, `customer_id`, `conversation_id` and `turn_id`; challenge alerts carry `participant_id`, `contest_id`, `scenario_id` and `turn_id`; Sales Domain wake alerts carry `user_id`.
- `agent_framework.engine.validator_failed` in `pipeline_ops_agent` is promoted to #error. The rule is registered additively, so a process that also embeds simpl-outreach keeps both apps' rules.
- Requires simpl_tracker `f581b40` or later (notify API version 3, report-once through `raise ... from`, the `__simpl_notify__` silent marker) and simpl_core `855253e` or later (`add_alert_rules`, `labels` on the Sales Domain wrappers).

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
- ROI admin: `src/simpl_api/api/v1/admin/roi.py` (domain in `simpl_core.roi`). People/expenses routes use `require_owner`.
- Managed Operations fleet: `GET /api/v1/admin/managed/operations/fleet` in `src/simpl_api/api/v1/admin/managed.py`, logic in `src/simpl_api/services/operations_fleet.py`. Scope defaults to everyone active at a customer with an active managed engagement; `engagedOnly=true` narrows it to the people pinned to the engagement; `allCustomers=true` covers every active person at every active customer, managed or not. Deactivated users and users of deactivated customers are never included. Per person it returns `autopilot` (state working/failing/idle/not_running/off, last run, blocker), `pipeline` (7-day reviews), `limits` (account stage, daily company supply, invite/message/email limits, mailbox status), `days` (7 UTC day buckets: suggested, reviewed, claimed, sends and failures per channel, accepted invites, replies, limiter counters and that day's capacity), `activity` (the window's sums), `alerts` (`kind`, `severity` critical/warning, `title`, `detail`) and `queue` (message drafts vs requests). Customers and the summary roll up `days`, `limits`, `activity` and `alerted_people`; the summary's own `alerts` hold fleet-wide problems such as no companies generated today.
- Dashboard roles: `src/simpl_api/api/v1/admin/platform_roles.py`. Hierarchy: owner > admin > staff. `is_admin` is derived.
- ROI time survey (token, not JWT): `src/simpl_api/api/v1/roi_survey.py`
- Agent code: `src/simpl_api/agents`
- Internal conventions: `.agent/INTERNAL.md`
