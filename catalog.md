# simpl internal libraries catalog

Auto-generated at `2026-05-20T10:48:39.591Z`. Do not edit by hand — run `node scripts/ci/generate-catalog.js` or merge a library sync PR.

Each entry summarizes an integration plugin (`*-context`). Install the plugin in Claude Code for the full SKILL. Until then, use this file to decide whether a library fits the current task.

## simpl_sales-context

- **Skill**: `simpl-sales`
- **Summary**: Next.js 14 sales frontend; tenant-scoped Supabase `sales` schema; never CASCADE-drop views that power API routes.
- **When to use**: Tasks touching SimpL Sales UI, API routes under `app/api/`, Supabase `sales` or `sales_view` objects, or CRM/outreach data models.
- **Required when**: Any migration or SQL that DROPs or replaces objects in `sales` / `sales_view` must follow the no-cascade checklist in this skill before merging.
- **Install full context (Claude Code)**: `/plugin install simpl_sales-context@simpl`
- **Skill path in cache**: `~/.claude/plugins/cache/simpl_knowledge/plugins/simpl_sales-context/skills/`

## simpl_tracker-context

- **Skill**: `simpl-tracker`
- **Summary**: Typed event tracker with batched HTTP flush to our warehouse; one method track(event_name, properties). No third-party analytics vendors.
- **When to use**: User or task needs product/analytics events, funnel metrics, feature usage, or structured logs shipped to the org warehouse from Python or Node services.
- **Required when**: Python or Node backend code that records billable or infra-cost-related usage (API calls, model tokens, compute units) must attribute spend via simpl-tracker patterns described in this skill — install this context plugin and follow it before merging.
- **Install full context (Claude Code)**: `/plugin install simpl_tracker-context@simpl`
- **Skill path in cache**: `~/.claude/plugins/cache/simpl_knowledge/plugins/simpl_tracker-context/skills/`
