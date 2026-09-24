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
- A seller's active hours, when the extension may send, are `outreach_prefs.active_hours` = `{"start": "HH:MM", "stop": "HH:MM", "timezone": "<IANA name>"}` (start inclusive, stop exclusive, start before stop). A missing field takes 07:00 / 19:00 / UTC, and an unset or invalid window runs on 07:00-19:00 UTC. `sales.resolve_active_hours(prefs jsonb[, at timestamptz])` resolves it: the extension task RPC gates on it, and `GET`/`PATCH /api/v1/app/preferences` return its answer as `active_hours_effective` (`start`, `stop`, `timezone`, `source` = `configured` | `unset` | `invalid`, `is_open_now`). `PATCH` merges `active_hours` one level deep, `null` resets it, and a value the resolver calls invalid, or a zone not spelled exactly as in IANA, is refused with 422. Read the window through the resolver (`services/active_hours.py`) instead of re-parsing the JSON. Review-answer follow-ups (`review_response_service._next_business_morning`) schedule at the start of the seller's window, 09:00 Europe/Rome without one, like simpl_core's retry triggers (simpl_core >= 0.8.2).
- Authenticate product routes with `auth.get_current_user`, which also refuses SimpL Challenge entrants; scope them with `simpl_api.guards`, whose `resolve_user_context` repeats that refusal against the database. Both are single places, so a new endpoint written against the ordinary dependencies inherits them. Do not reimplement either check per endpoint.
- Approval routes (journey-log `set-pending`, managed approve, Agent API draft approve and `bulk-approve`) and invite execution return the status the database settled on. simpl_core's dispatch authority rule can send an approved row back to `PENDING_APPROVAL` (`payload.authority.block_reason`) or cancel it, so callers must not assume `PENDING`; `bulk-approve` lists such rows under `withheld`, and invite execution answers 409.

- The funnel's ROI block is `POST /api/v1/app/reports/value` and `POST .../value/seat-request`. It is a staff beta: only SimpL staff (`is_admin`) get it, 403 for everyone else, and the response says `beta: true`. Setting `ROI_RELEASED_TO_CUSTOMERS=true` (also `1`/`yes`/`on`) in the API environment releases it to the customer's owners, billing admins and ICP managers; unset or any other value keeps it staff-only. The cost follows the model Stripe bills (a pay-per-call account line means pay per call; the database model only when Stripe cannot say). Staff can send `simulate_pay_per_call: true` to price a seat customer as if it paid per call (`simulated: true`, `viewer.can_simulate`); anyone else gets 403. The seat request is how ICP managers ask owners and billing admins for accounts through the governed in-app notification. All arithmetic lives in `services/customer_value/model.py`. `sales.icp.deal_size` means the yearly value of one new customer won from that ICP, in the customer's billing currency; it is set with `PATCH /api/v1/app/icps/{icp_id}/deal-size`, and the ROI prefers it over the median of `sales.deal`.
- Pay per call (`sales.customer_subscription.billing_model = 'pay_per_call'`): accounts are free and each company a customer moves to Meeting Booked (moved, not imported into the stage, from `billing_model_since` on) is charged once at its ICP's `sales.icp.call_price_cents`, EUR 70-150 in 10 EUR tiers from the pool size (`services/call_pricing.py`). `sales.call_charge` is the only record of charged calls; `background_jobs/call_billing.py` posts each as a Stripe pending invoice item on the customer's subscription, which the monthly invoice collects. The model follows the linked Stripe subscription (its `simpl_pay_per_call_account` line), set by `link_stripe_subscription` and payment-link completion. Admin routes: `/api/v1/admin/customers/{id}/call-charges` (list, void, credit, retry, manual add), `/admin/customers/{id}/call-pricing`, `/admin/icps/{id}/call-price`, `/admin/call-pricing/quote`, `/admin/call-pricing/icps`; payment links, `POST /admin/customers/{id}/subscription/create` and onboarding `billing_options` take `product = "pay_per_call"`. Stripe objects: `scripts/stripe_setup_pay_per_call.py`.

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
- ROI admin: `src/simpl_api/api/v1/admin/roi.py` (domain in `simpl_core.roi`). People/expenses routes use `require_owner`. `PUT /admin/roi/people` mints the person's `survey_token` when missing and does **not** write `roi.people_costs` — those rows come from `POST /admin/roi/people-costs/rebuild`, which rebuilds the table from PAYROLL bank lines. Fields absent from the JSON body are left untouched on an existing roster row (so a save that only sends name/RAL does not clear `from_month` / `to_month`). `POST /admin/roi/people/{person}/survey-token` mints one on demand; existing tokens are never rotated. `GET /admin/roi/people` is read-only and returns `survey_token: null` for whoever has none yet.
- Managed Operations fleet: `GET /api/v1/admin/managed/operations/fleet` in `src/simpl_api/api/v1/admin/managed.py`, logic in `src/simpl_api/services/operations_fleet.py`. Scope defaults to everyone active at a customer with an active managed engagement; `engagedOnly=true` narrows it to the people pinned to the engagement; `allCustomers=true` covers every active person at every active customer, managed or not. `POST`/`DELETE /admin/managed/engagements/{engagement_id}/users/{user_id}` pin or unpin one person (the invoiced seats follow the engagement's own `seat_count`, untouched here). Deactivated users and users of deactivated customers are never included. Per person it returns `autopilot` (state working/failing/idle/not_running/off, last run, blocker), `pipeline` (7-day reviews), `limits` (account stage, daily company supply, invite/message/email limits, mailbox status), `days` (7 UTC day buckets: suggested, reviewed, claimed, sends and failures per channel, accepted invites, replies, limiter counters and that day's capacity), `activity` (the window's sums), `alerts` (`kind`, `severity` critical/warning, `title`, `detail`) and `queue` (message drafts vs requests). Customers and the summary roll up `days`, `limits`, `activity` and `alerted_people`; the summary's own `alerts` hold fleet-wide problems such as no companies generated today.
- SimpL Challenge observability (read-only, `require_admin`): `GET /api/v1/admin/challenge/overview`, `/participants?include_sandbox=`, `/participants/{id}?version=` in `src/simpl_api/api/v1/admin/challenge.py`. Stage, flags and the automatic score (not calibrated: never rank with it) are defined in `docs/challenge-admin-api.md`.
- Dashboard roles: `src/simpl_api/api/v1/admin/platform_roles.py`. Hierarchy: owner > admin > staff. `is_admin` is derived.
- ROI time survey (token, not JWT): `src/simpl_api/api/v1/roi_survey.py`. `GET /roi/survey/bootstrap` and `GET /roi/survey/week` accept `week` (snapped to Monday) and `copy=true` to reuse the previous compiled week without writing it. Both answer only with allocations the person can still allocate onto: an initiative closed or merged after the fact is dropped from the payload, because it is no longer in their catalog and `POST /roi/survey/week` would refuse it and lock them out of the week. `POST /roi/survey/proposals` keeps the proposer's `note` (returned to the admin queue as `note`) and refuses a sixth pending proposal from the same person.
- ROI proposal decisions: `POST /admin/roi/proposals/{id}/decide` takes `action` = `publish` | `reject` | `recategorize` and answers with `decided_by` / `decided_at`, both stored on the row. Publishing under a different `parent_id` re-derives `category`, `lag_profile`, `roi_ranked` and `sort_order` from that line via `simpl_core.roi.catalog.child_defaults` — the same helper the create path uses, so the two cannot drift.
- ROI catalog merge (`require_platform_admin`): `GET /admin/roi/initiatives/{id}/time` lists who filed time on a row (`person`, `weeks`, `pct_avg`). `POST /admin/roi/initiatives/{id}/merge` takes `into` and an optional `redistribute: [{person, allocations: [{initiative_id, share}]}]`; everyone not named follows the merge onto `into`, and each named person's time on the row is split by `share` (each in (0, 100], summing to 100). The whole request is validated before the first write: a person with no time on the row, a person named twice, a destination that is closed, merged or still awaiting review, or `into` being one of the row's own projects answers 400 and changes nothing. A line's open projects move under `into` (re-deriving category, lag, ranking and sort order via `child_defaults`), and merging a line that has projects into a project is refused. The answer lists `redistributed` and `moved_projects`.
- Agent code: `src/simpl_api/agents`
- Internal conventions: `.agent/INTERNAL.md`
