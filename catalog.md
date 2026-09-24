# simpl internal libraries catalog

Auto-generated at `2026-09-24T13:42:40.851Z`. Do not edit by hand: every library sync regenerates it, or run `node scripts/ci/generate-catalog.js`.

Each entry summarizes an integration plugin (`*-context`). Install the plugin in Claude Code for the full SKILL. Until then, use this file to decide whether a library fits the current task.

## simpl_api-context

- **Skill**: `simpl_api`
- **Summary**: simpl_api integration guide
- **When to use**: Use this skill whenever the user asks about the simpl FastAPI backend, API routes, customer/admin endpoints, agent endpoints, prompt templates, exports, webhooks, background jobs, or code that calls `simpl_api` service behavior. This is primarily an app/service repo, not a reusable library.
- **Install full context (Claude Code)**: `/plugin install simpl_api-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_api-context/skills/`

## simpl_core-context

- **Skill**: `simpl_core`
- **Summary**: simpl_core integration guide
- **When to use**: Use this skill whenever the user asks about shared simpl platform domain logic, autopilot services, CRM/email/reports services, or code that imports `simpl_core`. ALWAYS consult this skill before adding duplicated business logic in app repos that could belong in `simpl_core`.
- **Install full context (Claude Code)**: `/plugin install simpl_core-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_core-context/skills/`

## simpl_flow-context

- **Skill**: `simpl_flow`
- **Summary**: simpl_flow integration guide
- **When to use**: Use this skill whenever the user asks about simpl Prefect flows, lead generation pipelines, job offer/company enrichment, ICP workflows, onboarding/customer-success pipelines, opportunity scoring/matching, or code that imports `simpl_flow`. This is primarily a workflow service repo.
- **Install full context (Claude Code)**: `/plugin install simpl_flow-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_flow-context/skills/`

## simpl_ia-context

- **Skill**: `simpl_ia`
- **Summary**: simpl_ia integration guide
- **When to use**: Use this skill whenever the user asks about vector search, embeddings, reranking, chunking, Milvus/Qdrant stores, structured LLM clients, Langfuse prompts, or code that imports `simpl_ia`. ALWAYS consult this skill before adding ad hoc embedding/search/LLM wrappers in simpl repos. Triggers on phrases like "vector search", "embed text", "Milvus", "chunk documents", "structured LLM output", "pydantic-ai agent".
- **Install full context (Claude Code)**: `/plugin install simpl_ia-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_ia-context/skills/`

## simpl_orm-context

- **Skill**: `simpl_orm`
- **Summary**: simpl_orm integration guide
- **When to use**: Use this skill whenever the user asks about PostgreSQL/Supabase database access, SQLModel models, async repositories, database sessions, pagination, RLS context, or code that imports `simpl_orm`. ALWAYS consult before writing new database access patterns in simpl Python repos.
- **Install full context (Claude Code)**: `/plugin install simpl_orm-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_orm-context/skills/`

## simpl_sales-context

- **Skill**: `simpl-sales`
- **Summary**: Next.js 14 sales frontend; tenant-scoped Supabase `sales` schema; never CASCADE-drop views that power API routes.
- **When to use**: Tasks touching SimpL Sales UI, API routes under `app/api/`, Supabase `sales` or `sales_view` objects, or CRM/outreach data models.
- **Required when**: Any migration or SQL that DROPs or replaces objects in `sales` / `sales_view` must follow the no-cascade checklist in this skill before merging.
- **Install full context (Claude Code)**: `/plugin install simpl_sales-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_sales-context/skills/`

## simpl_support-context

- **Skill**: `simpl_support`
- **Summary**: simpl_support integration guide
- **When to use**: First-party in-app support chat (@simpl/support). Use when wiring customer
  support messaging in simpl_sales, the staff inbox in simpl_dashboard, applying
  the support schema migration, screenshot/context capture, or replacing Intercom.
  Triggers: "support chat", "in-app support", "Intercom replacement", "support inbox".
- **Install full context (Claude Code)**: `/plugin install simpl_support-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_support-context/skills/`

## simpl_tracker-context

- **Skill**: `simpl_tracker`
- **Summary**: Mandatory cost ledger for every simpl service. Records LLM spend per request, paid data-provider calls and Cloud Run compute in Supabase, reports any untracked cost on its own Discord channel, and ships structured logging, Discord notifications and Langfuse helpers.
- **When to use**: Any code that spends money: a model call (pydantic-ai, OpenAI, OpenRouter, DeepSeek, Cheaper Inference or any other provider), an LLM batch job, a paid enrichment or scraping API, or compute on Google Cloud (Cloud Run service, worker pool, job, Prefect flow). Also when adding logging with Discord alerts or Langfuse tracing, or when checking recorded costs against a provider's billing export.
- **Required when**: Always. Every cost a simpl service incurs is recorded through simpl_tracker before merging: LLM spend through CostRecordingModel request receipts (attributed by @track_cost or an LLMAccountingScope; batch results through @track_batch_cost), paid data providers through @track_cost, and Google Cloud compute through track_instance_lifetime (services, worker pools) or @track_compute (jobs, Prefect flows). No custom cost tables and no untracked paid calls.
- **Install full context (Claude Code)**: `/plugin install simpl_tracker-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_tracker-context/skills/`
