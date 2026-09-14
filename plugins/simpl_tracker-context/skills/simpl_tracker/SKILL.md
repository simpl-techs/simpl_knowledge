---
name: simpl_tracker
description: |
  Use this skill whenever the user asks about cost tracking, logging with notifications, Langfuse tracing, Cloud Run compute/session tracking, or code that imports `simpl_tracker`. ALWAYS consult before adding ad hoc cost, logging, or notification wrappers in simpl repos.
---

# simpl_tracker integration guide

> **Maintained by**: the `simpl_tracker` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_tracker/.agent/SKILL.md`

## What this library is

`simpl_tracker` provides shared cost tracking decorators, structured logging, Discord notifications, infrastructure compute tracking, runtime detection, and Langfuse helpers for simpl Python services.

## Installation

```bash
poetry add "simpl-tracker @ git+https://github.com/simpl-techs/simpl_tracker.git@main"
```

For local development against a sibling checkout:

```bash
poetry add --editable ../simpl_tracker
```

Restore the Git dependency before committing unless the PR intentionally changes dependency wiring.

## Basic usage

```python
from simpl_tracker import configure_from_yaml, LOG, track_cost

configure_from_yaml(supabase_client=existing_client)
LOG.info("Service started", repo="simpl-api", notify=True)

@track_cost(service="ai_llm", process="planner_agent")
def call_ai(prompt: str, user_id: str | None = None):
    return ai_client.run(prompt)
```

## Rules and conventions

- Prefer `configure_from_yaml()` once at process startup. Do not configure tracking inside hot paths.
- Use `LOG` or `get_logger(__name__)` instead of raw `print` or per-module logging setup.
- Use `track_cost`, `track_batch_cost`, and `track_compute` instead of custom cost table writes.
- Notification failures must remain fail-safe; they should log but not block the workload.
- Discord webhooks are raw URLs from env (`DISCORD_ERROR_WEBHOOK_URL`, `DISCORD_WARNING_WEBHOOK_URL`, `DISCORD_SUCCESS_WEBHOOK_URL`), interpolated in `tracker.yaml`. Do not load Prefect `DiscordWebhook` blocks.
- Duplicate Discord alerts inside the configured window (default 1h) are collapsed in-process onto the first message. N processes produce at most N copies, not 1.

- For request accounting, use `simpl_tracker.llm_model.CostRecordingModel` and
  `simpl_tracker.llm_accounting.LLMAccountingScope`. Enable `request_accounting`
  only after the coordinated schema/library release. See the README contract.
- `CostEntry.cost_usd` and `TrackingResult.cost_usd` may be `None` for unknown LLM
  prices. Never replace unknown amounts with a fabricated zero.
- Drain `simpl_tracker.llm_accounting.drain_llm_receipts()` during graceful shutdown.
- Request receipts bypass legacy required-ID skipping; missing attribution is
  retained. Their delivery is idempotent and suppresses enclosing run totals.

## Common pitfalls

- Do not use the older `Tracker.from_env()` event-tracker API wording; this repo exposes cost/logging/tracing helpers.
- A missing webhook URL mutes that notification level and must never raise. If notifications are enabled and no URL resolved at all, startup logs an error.
- Do not require `user_id` or `ulc_id` unless the repo config explicitly does so.

## Testing

```bash
conda activate simpl_tracker
poetry install
poetry run pytest
poetry run ruff check .
```

Tests marked `real_api` require real provider keys and should not be run by default.

## What this library does NOT do

- Does not own business workflow logic. Use `simpl_core` or the app repo.
- Does not define database ORM primitives. Use `simpl_orm`.
- Does not replace Langfuse itself; it provides simpl wrappers and propagation helpers.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_tracker`
- Consumer config example: `config/tracker.yaml` in app repos
- Internal conventions: `.agent/INTERNAL.md`
