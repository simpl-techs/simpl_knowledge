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
- `gcp_memory_projection_flow` runs every five minutes and incrementally applies
  pending `agent_memory` revisions to Zilliz. It requires `NEBIUS_API_KEY`,
  `MILVUS_URI`, and `MILVUS_TOKEN`; do not replace it with routine collection
  rebuilds.
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
