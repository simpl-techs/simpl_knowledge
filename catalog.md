# simpl internal libraries catalog

Auto-generated at `2026-09-23T23:12:13.418Z`. Do not edit by hand — run `node scripts/ci/generate-catalog.js` or merge a library sync PR.

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

## simpl_sales-context

- **Skill**: `simpl-sales`
- **Summary**: Next.js 14 sales frontend; tenant-scoped Supabase `sales` schema; never CASCADE-drop views that power API routes.
- **When to use**: Tasks touching SimpL Sales UI, API routes under `app/api/`, Supabase `sales` or `sales_view` objects, or CRM/outreach data models.
- **Required when**: Any migration or SQL that DROPs or replaces objects in `sales` / `sales_view` must follow the no-cascade checklist in this skill before merging.
- **Install full context (Claude Code)**: `/plugin install simpl_sales-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_sales-context/skills/`

## simpl_tracker-context

- **Skill**: `simpl-tracker`
- **Summary**: Typed event tracker with batched HTTP flush to our warehouse; one method track(event_name, properties). No third-party analytics vendors.
- **When to use**: User or task needs product/analytics events, funnel metrics, feature usage, or structured logs shipped to the org warehouse from Python or Node services.
- **Required when**: Python or Node backend code that records billable or infra-cost-related usage (API calls, model tokens, compute units) must attribute spend via simpl-tracker patterns described in this skill — install this context plugin and follow it before merging.
- **Install full context (Claude Code)**: `/plugin install simpl_tracker-context@simpl`
- **Skill path in cache**: `~/.simpl_knowledge/cache/plugins/simpl_tracker-context/skills/`
