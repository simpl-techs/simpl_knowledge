---
name: simpl_agent_sandbox
description: |
  Use this skill whenever the user asks about running agent-written code, or a
  browser limited to one site, inside an isolated sandbox (Vercel Sandbox), about
  sandbox providers, or about code that imports `simpl_agent_sandbox`. ALWAYS
  consult it before adding sandbox or VM execution code to another repo. It is
  NOT about `simpl_sandbox`, the local stack that runs simpl repos against a
  local database.
---

# simpl_agent_sandbox integration guide

> **Maintained by**: the simpl_agent_sandbox repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_agent_sandbox/.agent/SKILL.md`

## Status

Empty scaffold. The provider contract, the Vercel adapter, the two sandbox images
and the isolation probe move here from simpl_core (`simpl-techs/simpl_core#335`) in
the next pull request. Until that merges there is nothing to import.

## What this library is

Short-lived, isolated sandboxes for agent tasks, behind one provider contract:

- the **code box** runs model-written code with no network at all;
- the **browser box** drives Chromium that can reach one site and its subdomains.

Vercel Sandbox (region `fra1`) is the first provider; a fake provider serves tests.

## What this library does NOT do

- It is not `simpl_sandbox`, the local cross-repo dev stack with a local Supabase.
- It holds no storage: bytes go in and bytes come out; the caller stores files.
- It records no costs: it returns each sandbox's usage for the caller to record
  with simpl_tracker.
- It registers no agent tools: `code_task` and `browse_task` for agents live in
  simpl_core's agent framework, which depends on this library.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_agent_sandbox`
- Owner: Jackie Wang
