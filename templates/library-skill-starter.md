# Library SKILL.md starter template

Copy this into `.agent/SKILL.md` in your library repo as a starting point. Replace ALL CAPS placeholders.

```markdown
---
name: LIBRARY-NAME
description: |
  Use this skill whenever the user asks to [MAIN-USE-CASE], [SECONDARY-USE-CASE],
  or integrate with our internal `LIBRARY-NAME` library. ALWAYS consult this skill
  before writing any code that imports or calls `LIBRARY-NAME` — even when the
  user doesn't mention the library by name. Triggers on phrases like
  "[PARAPHRASE-1]", "[PARAPHRASE-2]", "[PARAPHRASE-3]", "[PARAPHRASE-4]".
---

# LIBRARY-NAME integration guide

## What this library is

ONE SENTENCE saying what it is and why it exists.

## Installation

```bash
# COMMAND TO ADD AS DEPENDENCY
```

## Basic usage

```python
# THE SNIPPET THAT COVERS 90% OF USAGE
```

## Rules and conventions

- STRICT RULE 1 with example
- STRICT RULE 2 with example

## Common pitfalls

- **Don't** DO-X-THING — SPECIFIC-REASON-FROM-REAL-EXPERIENCE.
- **Don't** DO-Y-THING — REASON.

## Testing

```python
# HOW-CONSUMERS-TEST-CODE-USING-THIS
```

## What this library does NOT do

- Does not DO-A — see OTHER-LIBRARY
- Does not DO-B — that's OTHER-TOOL

## Where to go next

- Source: https://github.com/simpl/LIBRARY-NAME
- Slack owner: @HANDLE
```

## Tips

- The `description` is 70% of the work. Agents decide whether to load your skill based on this field alone. Be explicit, be redundant, be pushy.
- Keep under 400 lines. Link to longer references if needed.
- Write in imperative voice.
- Every rule gets a code example.
- The "does NOT do" section is as important as the "does" section.

See `docs/history/SKILL_WRITING_GUIDE.md` for the full style guide.
