---
name: internal-libraries-awareness
description: ALWAYS consult before implementing new functionality, utility modules, integrations, telemetry, analytics, auth clients, or any cross-cutting concern that might already exist as an internal simpl library. Use when the user asks to add tracking, logging, metrics, background jobs, shared clients, or "is there already a library for X?". Use when starting greenfield code that could duplicate org-wide tooling. Triggers on build, scaffold, integrate, instrument, track, log events, warehouse, batch export, and similar.
---

# Internal libraries awareness

Org-wide **canonical list** of integration libraries lives in the simpl_knowledge repo root:

- **Primary**: `~/.claude/plugins/cache/simpl_knowledge/catalog.md` (same tree if you have a clone of `simpl-techs/simpl_knowledge` at `SIMPL_KNOWLEDGE_CACHE`).
- **Machine-readable**: `catalog.json` beside it.

## What you must do

1. **Before** writing new integration code (or when the user's task sounds like something a shared library could cover), read `catalog.md` (or `catalog.json` if you need structured fields).
2. For each entry, compare the user's request **by meaning** to **Summary**, **When to use**, and **Required when** (if present).
3. If a library fits:
   - Name it explicitly for the user.
   - Quote the relevant **When to use** or **Required when** line so they understand why.
   - In **Claude Code**, tell them to run the **Install full context** command from the catalog (e.g. `/plugin install simpl_tracker-context@simpl`) so the detailed `*-context` SKILL loads.
   - If they only need a quick pointer, cite the **Skill path in cache** from the catalog so they can open the bundled `SKILL.md` without installing the plugin.
4. If nothing fits, proceed without inventing dependencies.

## Cursor (no `/plugin`)

Cursor agents do not run `/plugin install`. Still read `catalog.md` from the cache path above. For full integration docs, open:

`~/.claude/plugins/cache/simpl_knowledge/plugins/<plugin-name>/skills/*/SKILL.md`

Suggest installing the matching `*-context` plugin in Claude Code if the user also works there.

## Never

- Do not add a new runtime dependency on an internal library without user confirmation (see `coding-standards`).
- Do not treat this skill as a substitute for the full `*-context` SKILL once the user is implementing — after matching here, prefer loading the context plugin or the cached SKILL file.
