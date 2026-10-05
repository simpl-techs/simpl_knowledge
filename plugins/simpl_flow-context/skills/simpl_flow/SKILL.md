---
name: simpl_flow
description: |
  Use this skill whenever the user asks about simpl Prefect flows, lead generation pipelines, job offer/company enrichment, ICP workflows, onboarding/customer-success pipelines, opportunity scoring/matching, or code that imports `simpl_flow`. This is primarily a workflow service repo.
---

# simpl_flow integration guide

> **Maintained by**: the `simpl_flow` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_flow/.agent/SKILL.md`

## What this service is

`simpl_flow` contains Prefect flows, pipelines, bots, and AI services for sales intelligence: job-offer analysis, company enrichment, ICP workflows, opportunity matching/scoring, onboarding, customer success, embeddings, and scheduled workflow execution.

## Installation

```bash
conda env create -f environment.yml
conda activate simpl_flow
poetry install
cp .env.example .env
```

This repo is normally run as workflows/deployments, not imported as a generic library.

## Basic usage

```bash
conda activate simpl_flow
prefect cloud login
poetry run prefect deploy --all
```

Only deploy when the user explicitly asks. For code changes, work under `src/simpl_flow/flows`, `pipelines`, `services`, or `bot`.

## Rules and conventions

- Keep reusable business/domain logic in `simpl_core` when it is needed outside workflow execution.
- Keep workflow orchestration in flows/pipelines; keep provider/database details behind services/repositories.
- Use `simpl_tracker` for tracking/logging and `simpl_orm` for shared database patterns.
- `gcp_post_search_index_flow` (every five minutes) adds new posts to `sales.post_search_index` (migration 065) by reading
  `sales.post` / `sales.post_repost` (no trigger or index on them), claims pending rows,
  builds and embeds post records (Nebius, Qwen3-Embedding-8B), commits them to the row
  store on GCS, and with a `collection` parameter keeps that Zilliz collection in
  step. A backlog (a backfill marks every post) drains through the schedule; by hand
  with `promote_alias` it moves that alias to the collection once caught up.
  `gcp_post_search_maintenance_flow` (compaction every 15 minutes; at 02:30 UTC also the sweep)
  marks pending again what changed or went away, then compacts the row store datasets. The dataset parameter is
  `name:version:dims`. The logic lives in simpl_core (`row_store`, `search.posts`);
  needs the Doppler `ROW_STORE_URI`, `NEBIUS_API_KEY` and `MILVUS_*` keys; the job's
  service account reaches the bucket (no Google key in the environment).
- `gcp_landing_search_index_flow` indexes company websites as the crawl stores them, one
  document per site, into `landing_pages:1:4096` and the Zilliz collection
  `landing_pages_v1` (alias `landing_pages`; ledger `sales.landing_search_index`,
  migration 075). Two modes sharing the ledger, so neither redoes the other's work:
  a **scoped run** (manual: `{"scope_name": "italy", "scope_countries": ["ITA", "IT"]}`,
  or `{"scope_name": "all"}` for every company) indexes exactly that scope, on its own
  cursor; the **general run** (the defaults, and the 5-minute schedule, off until a
  scope is indexed) follows the crawl for the sites already in the ledger and indexes
  what changed, adding none. Reads only the crawl's tables; bodies come from the
  crawl's bucket (`simpl-web-pages`) through the Doppler `WASABI_ACCESS_KEY` and
  `WASABI_SECRET_KEY` keys. The logic lives in simpl_core (`search.landing` on
  `search.index`, installed through `simpl-core[search]`); maintenance is
  `gcp_post_search_maintenance_flow`'s, with the landing dataset in its list.
- `gcp_memory_projection_flow` runs every five minutes and incrementally applies
  pending `agent_memory` revisions to Zilliz. It requires `NEBIUS_API_KEY`,
  `MILVUS_URI`, and `MILVUS_TOKEN`; do not replace it with routine collection
  rebuilds.
- Flow-runner autopilot sessions end `completed` when at least one company succeeded,
  `error` when the run raised or companies failed and none succeeded, and `stopped` when
  the run was interrupted: lease lost, run cancelled, or every company re-queued because
  the extension channel dropped. A dropped channel never makes an `error` session; the
  flow's result reports those companies as `requeued`. Read `error` sessions as real
  failures.
- `generate_opportunities_flow` works only ICPs someone receives, as defined by
  `sales_view.opportunity_recipient`: an active assignee, not on vacation, of a customer
  whose `metadata.is_active` is not `false`. Each run deletes the non-manual
  opportunities nobody receives, and autopilot's candidate view applies the same rule, so
  deactivating a user, an ICP or a customer stops both without any other change.
- A Customer company (lead status 10) and a company imported with a `Dummy Imported`
  connection are watched, never proposed: their signals land in
  `opportunity.icp_signal_monitor` (the watchlist), but they are never a new or
  `fallback_monitoring` opportunity, so autopilot never gets them either.
- Discord alerts: agent framework failures, autopilot per-user failures and
  opportunities per-ICP failures post to #warning once per failure, and a failure that
  keeps recurring edits one message and escalates to #error after an hour. Dropped
  extension channels never alert; a cancelled run or a lost autopilot lease posts
  `agent_framework.run.cancelled`.
- Document required environment variables when adding a new provider, deployment, or integration.
- Configuration and secrets are supplied by Doppler (project `simpl_flow`) as plain environment variables; the service reads them through `simpl_flow.config.Config` / `SecretManager`. Prefect blocks are not part of the configuration contract.
- Treat `prefect.yaml` as production deployment configuration: image tags, schedules, resource limits, and concurrency limits affect live workflows.
- Prefer calling stable services or flows rather than importing flow-local models/contracts into another repo. Promote shared contracts to `simpl_core` first.
- Treat existing flow-local models and services as legacy unless they are clearly deployment-specific. If a change makes them more generally useful, move or recreate the shared contract in `simpl_core`.
- New reusable models, DTOs, repositories, and services should normally start in `simpl_core`, not `simpl_flow`.

## Common pitfalls

- Do not run deployment commands unless the user explicitly wants deployment.
- Do not add one-off database access patterns when a repository/service boundary exists.
- Do not bypass Prefect conventions for retryable/scheduled workflow behavior.
- Do not commit provider credentials or local `.env` values.
- Do not add unbounded scraping, LLM, database, or provider fan-out. Every batch/worker loop needs an explicit cap.
- Do not add raw SQL in flow entry points or bot orchestration; isolate database-specific logic in repositories/importers.
- Do not import flow-local legacy models/services from other repos as a shortcut; promote the shared piece to `simpl_core`.

## Testing

```bash
conda activate simpl_flow
poetry install
poetry run pytest
poetry run ruff check .
```

## What this service does NOT do

- Does not expose the platform HTTP API. That is `simpl_api`.
- Does not own reusable business primitives. Put those in `simpl_core`.
- Does not own frontend user experience. Use the frontend repos.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_flow`
- Flow code: `src/simpl_flow/flows`
- Pipeline code: `src/simpl_flow/pipelines`
- ROI ingest: `src/simpl_flow/pipelines/roi` (Revolut → `roi.transactions`, A-Cube → `roi.revenues`, tagging apply)
- Internal conventions: `.agent/INTERNAL.md`
