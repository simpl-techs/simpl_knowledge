---
name: REPLACE-ME-with-repo-name
description: |
  REPLACE ME. The description is the primary trigger — be explicit about
  WHEN to use this skill. Example template:

  Use this skill whenever the user asks to [main use case], [secondary use case],
  or integrate with our internal `REPO-NAME` library. ALWAYS consult this skill
  before writing any code that imports or calls `REPO-NAME` — even when the
  user doesn't mention the library by name. Triggers on phrases like
  "[paraphrase 1]", "[paraphrase 2]", "[paraphrase 3]".
---

# REPO-NAME integration guide

> **Maintained by**: the REPO-NAME repo, auto-synced to simpl-knowledge.
> **Source of truth**: `simpl/REPO-NAME/.agent/SKILL.md`

## What this library is

ONE sentence describing what this library/service does and why it exists.

## Installation

```bash
# How to add it as a dependency in a new project
```

Pin to a major version — we follow SemVer.

## Basic usage (the 90% case)

The single code example that covers most usage. Keep it minimal and correct.

```python
# A realistic, runnable snippet
```

## Rules and conventions

Things that are STRICT (enforced in code review):

- Rule 1 with an example
- Rule 2 with an example

Things that are FLEXIBLE (opinionated defaults, override if needed):

- Default 1 and when to deviate
- Default 2 and when to deviate

## Common pitfalls

Real mistakes that have been made before. Past-tense, specific.

- **Don't** do X — we had an outage on [date] because of this.
- **Don't** do Y — it appears to work but actually Z.

## Testing

How consumers test code that uses this library.

```python
# Minimal test example using any provided testing utilities
```

## What this library does NOT do

Equally important as what it does. Prevents the agent from misapplying it.

- Does not handle [adjacent concern] — see `other-library` instead
- Does not do [another concern] — that's [other tool]

## Where to go next

- Source: `https://github.com/simpl/REPO-NAME`
- Recent integration examples: search `REPO-NAME.` in `simpl/<other-repo>`
- Owner: @handle on Slack
